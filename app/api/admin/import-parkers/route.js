const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");
const { normalizeUnit } = require("../../../../lib/vehicleAccess");

// Expected CSV columns (case-insensitive, order doesn't matter):
// first_name, last_name, unit, make, model, color, license_plate,
// decal_number, section, location, wash_day, fuel_type
//
// One row per person per car, the way the monthly parking applications are
// filled in:
// - Two people on the same application (e.g. husband and wife) → the car
//   appears on two rows with the same decal. Both get an account and both
//   can see and request that car. (Only within the same unit — a decal that
//   shows up under a different unit is reported instead, in case of a typo.)
// - One person with two cars → two rows with their name. They get one
//   account with both cars.
// - Same first name, last name and unit = the same person (also matches
//   accounts that already exist in the building, so importing an updated
//   file only adds what's new).
//
// Every new resident gets the default password "Bringmycar" and must choose
// their own the first time they sign in.
// Username is the first initial + last name, lowercased: John Smith -> jsmith.
// If that's taken, a number is added: jsmith2, jsmith3, ...

const DEFAULT_PASSWORD = "Bringmycar";

const VALID_WASH_DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
const VALID_FUEL_TYPES = ["GASOLINE","ELECTRIC","PLUGIN_HYBRID"];

// Splits one CSV line, keeping commas inside "quoted values" together.
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCSV(text) {
  // Excel's "CSV UTF-8" adds an invisible marker at the start; drop it.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = splitCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.every((v) => !v)) continue; // skip blank lines
    const row = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));
    rows.push(row);
  }
  return rows;
}

function generateUsername(firstName, lastName, existing) {
  const clean = (v) => (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = clean(firstName);
  const last = clean(lastName);
  const base = (last ? first.slice(0, 1) + last : first) || "resident";
  let username = base;
  let counter = 2;
  while (existing.has(username)) {
    username = `${base}${counter}`;
    counter++;
  }
  existing.add(username);
  return username;
}

const personKey = (name, unit) =>
  `${String(name || "").toLowerCase().replace(/\s+/g, " ").trim()}|${normalizeUnit(unit)}`;

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
    return new Response(JSON.stringify({ error: "Choose which building to import these residents into." }), { status: 400 });
  }
  const targetBuilding = await prisma.building.findUnique({
    where: { id: targetBuildingId },
    select: { id: true },
  });
  if (!targetBuilding) {
    return new Response(JSON.stringify({ error: "That building wasn't found." }), { status: 400 });
  }

  let rows;
  try {
    rows = parseCSV(csvText);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }

  // Load existing usernames to avoid duplicates (ignoring capital letters,
  // since sign-in doesn't care about them either).
  const existingUsers = await prisma.user.findMany({ select: { username: true } });
  const existingUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
  // Hash the shared starting password once instead of once per resident.
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Residents already in this building, by name + unit.
  const people = new Map();
  const residents = await prisma.user.findMany({
    where: { buildingId: targetBuildingId, role: "GUEST" },
    select: { id: true, name: true, unitNumber: true },
    orderBy: { createdAt: "asc" },
  });
  for (const r of residents) {
    const key = personKey(r.name, r.unitNumber);
    if (!people.has(key)) people.set(key, { id: r.id, name: r.name, isNew: false });
  }
  // Residents imported before unit numbers were saved have none on file.
  // They're matched by name alone (only when exactly one person has that
  // name), and the unit from the file is saved on their account.
  const noUnitByName = new Map();
  for (const r of residents) {
    if (normalizeUnit(r.unitNumber)) continue;
    const k = personKey(r.name, "");
    noUnitByName.set(k, noUnitByName.has(k) ? null : r); // null = more than one, don't guess
  }

  // Cars already in this building, by decal. Decals only need to be unique
  // within a building.
  const cars = new Map();
  const existingCars = await prisma.vehicle.findMany({
    where: { buildingId: targetBuildingId },
    select: {
      id: true,
      ticketNumber: true,
      ownerId: true,
      isVisitor: true,
      owner: { select: { name: true, unitNumber: true } },
      drivers: { select: { userId: true, user: { select: { unitNumber: true } } } },
    },
  });
  for (const v of existingCars) {
    cars.set(v.ticketNumber, {
      id: v.id,
      ownerId: v.ownerId,
      ownerName: v.owner?.name || "",
      ownerUnit: v.owner?.unitNumber || "",
      isVisitor: v.isVisitor,
      people: new Set([v.ownerId, ...v.drivers.map((d) => d.userId)]),
      units: new Set([v.owner?.unitNumber, ...v.drivers.map((d) => d.user?.unitNumber)].map(normalizeUnit).filter(Boolean)),
    });
  }

  const results = []; // new accounts
  const resultsByUser = new Map();
  const updates = []; // changes for people who already had an account
  const errors = [];
  let unchanged = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    const firstName = row.first_name || row.firstname || row.first || "";
    const lastName = row.last_name || row.lastname || row.last || "";
    const unit = row.unit || row.unit_number || row.unit_no || "";
    const decalNumber = row.decal_number || row.decal || row.ticket_number || row.ticket || "";

    if (!firstName) {
      errors.push({ row: rowNum, error: "first_name is required" });
      continue;
    }
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const existingCar = decalNumber ? cars.get(decalNumber) : null;
    if (existingCar && existingCar.isVisitor) {
      errors.push({ row: rowNum, error: `Ticket #${decalNumber} is a visitor car at this building — row skipped` });
      continue;
    }

    try {
      // 1. The person: reuse their account if they're already in the
      //    building (or earlier in this file), otherwise create one.
      const key = personKey(name, unit);
      let person = people.get(key);
      const oldNoUnit = !person && normalizeUnit(unit) ? noUnitByName.get(personKey(name, "")) : null;
      if (oldNoUnit) {
        await prisma.user.update({ where: { id: oldNoUnit.id }, data: { unitNumber: unit } });
        noUnitByName.delete(personKey(name, ""));
        person = { id: oldNoUnit.id, name: oldNoUnit.name, isNew: false };
        people.set(key, person);
        // Their cars now belong to this unit too.
        for (const c of cars.values()) if (c.people.has(oldNoUnit.id)) c.units.add(normalizeUnit(unit));
        updates.push({ row: rowNum, message: `${name}: unit ${unit} saved on their existing account` });
      }
      if (!person) {
        const username = generateUsername(firstName, lastName, existingUsernames);
        const user = await prisma.user.create({
          data: {
            name,
            username,
            passwordHash,
            role: "GUEST",
            buildingId: targetBuildingId,
            unitNumber: unit || null,
            // Everyone starts with the shared default password, so residents
            // must pick their own on first sign-in.
            mustChangePassword: true,
          },
        });
        person = { id: user.id, name, isNew: true };
        people.set(key, person);
        const entry = { row: rowNum, name, username, password: DEFAULT_PASSWORD, unit, decals: [] };
        results.push(entry);
        resultsByUser.set(user.id, entry);
      }

      // 2. The car.
      if (!decalNumber) {
        if (!person.isNew) unchanged++;
        continue;
      }
      if (!existingCar) {
        const washDay = VALID_WASH_DAYS.includes((row.wash_day || "").toUpperCase())
          ? row.wash_day.toUpperCase()
          : null;
        const fuelType = VALID_FUEL_TYPES.includes((row.fuel_type || "").toUpperCase())
          ? row.fuel_type.toUpperCase()
          : "GASOLINE";
        const vehicle = await prisma.vehicle.create({
          data: {
            make: row.make || null,
            model: row.model || null,
            color: row.color || null,
            licensePlate: row.license_plate || row.plate || null,
            ticketNumber: decalNumber,
            ownerId: person.id,
            buildingId: targetBuildingId,
            section: row.section || null,
            location: row.location || null,
            washDay,
            fuelType,
            claimToken: crypto.randomBytes(16).toString("hex"),
          },
        });
        cars.set(decalNumber, {
          id: vehicle.id,
          ownerId: person.id,
          ownerName: name,
          ownerUnit: unit,
          isVisitor: false,
          people: new Set([person.id]),
          units: new Set([normalizeUnit(unit)].filter(Boolean)),
        });
        if (person.isNew) resultsByUser.get(person.id).decals.push(decalNumber);
        else updates.push({ row: rowNum, message: `${name}: car #${decalNumber} added` });
      } else if (existingCar.people.has(person.id)) {
        // Already set up — nothing to do.
        if (person.isNew) resultsByUser.get(person.id).decals.push(decalNumber);
        else unchanged++;
      } else if (!normalizeUnit(unit) || !existingCar.units.has(normalizeUnit(unit))) {
        // Same decal but a different (or missing) unit — probably a typo, so
        // don't hand someone else's car over automatically.
        const where = existingCar.ownerUnit ? ` (Unit ${existingCar.ownerUnit})` : "";
        errors.push({
          row: rowNum,
          error: person.isNew
            ? `Decal #${decalNumber} belongs to ${existingCar.ownerName}${where}, a different unit — ${name}'s account was created without this car. If they really share it, add ${name} to the car from the Users screen.`
            : `Decal #${decalNumber} belongs to ${existingCar.ownerName}${where}, a different unit — not added for ${name}. If they really share it, add ${name} to the car from the Users screen.`,
        });
      } else {
        // Another name on the same parking application: share the car.
        await prisma.vehicleDriver.create({ data: { vehicleId: existingCar.id, userId: person.id } });
        existingCar.people.add(person.id);
        if (person.isNew) resultsByUser.get(person.id).decals.push(decalNumber);
        updates.push({
          row: rowNum,
          message: `${name} added to car #${decalNumber} (shared with ${existingCar.ownerName})`,
        });
      }
    } catch (err) {
      errors.push({ row: rowNum, error: err.message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, created: results.length, errors, results, updates, unchanged }),
    { status: 200 }
  );
}

module.exports = { POST };
