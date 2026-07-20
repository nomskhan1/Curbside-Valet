const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Expected CSV columns (case-insensitive, order doesn't matter):
// first_name, last_name, unit, make, model, color, license_plate,
// decal_number, section, location, wash_day
//
// Password defaults to unit number if provided, otherwise a random 8-char string.
// Username is first_name.last_name (lowercased, spaces replaced with dots).

const VALID_WASH_DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
const VALID_FUEL_TYPES = ["GASOLINE","ELECTRIC","PLUGIN_HYBRID"];

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    if (values.every((v) => !v)) continue; // skip blank lines
    const row = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));
    rows.push(row);
  }
  return rows;
}

function generateUsername(firstName, lastName, existing) {
  const base = `${firstName}.${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.+/g, ".");
  let username = base;
  let counter = 1;
  while (existing.has(username)) {
    username = `${base}${counter}`;
    counter++;
  }
  existing.add(username);
  return username;
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), { status: 403 });
  }

  const body = await req.json();
  const { csvText, buildingId } = body || {};

  if (!csvText) {
    return new Response(JSON.stringify({ error: "No CSV data provided." }), { status: 400 });
  }

  // Managers can only import into their own building
  const targetBuildingId =
    session.role === "MANAGER" ? session.buildingId : (buildingId || session.buildingId);

  if (!targetBuildingId) {
    return new Response(JSON.stringify({ error: "No building selected." }), { status: 400 });
  }

  let rows;
  try {
    rows = parseCSV(csvText);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }

  // Load existing usernames to avoid duplicates
  const existingUsers = await prisma.user.findMany({ select: { username: true } });
  const existingUsernames = new Set(existingUsers.map((u) => u.username));
  const existingDecals = new Set(
    (await prisma.vehicle.findMany({ select: { ticketNumber: true } })).map((v) => v.ticketNumber)
  );

  const results = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    const firstName = row.first_name || row.firstname || row.first || "";
    const lastName = row.last_name || row.lastname || row.last || "";
    const unit = row.unit || row.unit_number || row.unit_no || "";

    if (!firstName) {
      errors.push({ row: rowNum, error: "first_name is required" });
      continue;
    }

    const username = generateUsername(firstName, lastName, existingUsernames);
    const password = unit || crypto.randomBytes(4).toString("hex");
    const passwordHash = await bcrypt.hash(password, 10);
    const name = [firstName, lastName].filter(Boolean).join(" ");

    try {
      const user = await prisma.user.create({
        data: {
          name,
          username,
          passwordHash,
          role: "GUEST",
          buildingId: targetBuildingId,
        },
      });

      // Create vehicle if decal number provided
      const decalNumber = row.decal_number || row.decal || row.ticket_number || row.ticket || "";
      if (decalNumber) {
        if (existingDecals.has(decalNumber)) {
          errors.push({ row: rowNum, error: `Decal #${decalNumber} already exists — account created but no vehicle added` });
        } else {
          existingDecals.add(decalNumber);
          const washDay = VALID_WASH_DAYS.includes((row.wash_day || "").toUpperCase())
            ? row.wash_day.toUpperCase()
            : null;
          const fuelType = VALID_FUEL_TYPES.includes((row.fuel_type || "").toUpperCase())
            ? row.fuel_type.toUpperCase()
            : "GASOLINE";

          await prisma.vehicle.create({
            data: {
              make: row.make || null,
              model: row.model || null,
              color: row.color || null,
              licensePlate: row.license_plate || row.plate || null,
              ticketNumber: decalNumber,
              ownerId: user.id,
              buildingId: targetBuildingId,
              section: row.section || null,
              location: row.location || null,
              washDay,
              fuelType,
              claimToken: crypto.randomBytes(16).toString("hex"),
            },
          });
        }
      }

      results.push({
        row: rowNum,
        name,
        username,
        password,
        unit,
        decal: decalNumber || null,
      });
    } catch (err) {
      errors.push({ row: rowNum, error: err.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, created: results.length, errors, results }), {
    status: 200,
  });
}

module.exports = { POST };
