const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function dayOfWeekFor(dateStr) {
  // Parse as a plain calendar date (no time), matching how the date param
  // is passed from the client (YYYY-MM-DD, no timezone conversion).
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DAY_NAMES[date.getDay()];
}

// GET /api/washes?date=YYYY-MM-DD
// Returns every vehicle whose recurring washDay matches that date's weekday,
// plus whether it's already been completed for that specific date.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });
  if (!["ADMIN", "MANAGER", "STAFF"].includes(session.role)) {
    return new Response(JSON.stringify({ error: "Staff access required." }), { status: 403 });
  }

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date");
  if (!dateStr) {
    return new Response(JSON.stringify({ error: "date query param is required (YYYY-MM-DD)." }), {
      status: 400,
    });
  }

  const weekday = dayOfWeekFor(dateStr);

  const where = { washDay: weekday };
  if (session.role === "STAFF" || session.role === "MANAGER") {
    where.buildingId = session.buildingId || "__none__";
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      owner: { select: { name: true, username: true } },
      building: { select: { name: true } },
      washLogs: {
        where: { washDate: new Date(`${dateStr}T00:00:00`) },
      },
    },
    orderBy: { ticketNumber: "asc" },
  });

  const result = vehicles.map((v) => ({
    id: v.id,
    make: v.make,
    model: v.model,
    color: v.color,
    ticketNumber: v.ticketNumber,
    section: v.section,
    owner: v.owner,
    building: v.building,
    completed: v.washLogs.length > 0 ? v.washLogs[0] : null,
  }));

  return new Response(JSON.stringify(result), { status: 200 });
}

// POST { vehicleId, date, initials } — mark a wash complete for that date.
// Staff can only log for their own building's vehicles; manager/admin can
// override (re-submit with new initials) an existing log for the same day.
async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });
  if (!["ADMIN", "MANAGER", "STAFF"].includes(session.role)) {
    return new Response(JSON.stringify({ error: "Staff access required." }), { status: 403 });
  }

  const body = await req.json();
  const { vehicleId, date, initials } = body || {};
  if (!vehicleId || !date || !initials || !initials.trim()) {
    return new Response(JSON.stringify({ error: "vehicleId, date, and initials are required." }), {
      status: 400,
    });
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    return new Response(JSON.stringify({ error: "Vehicle not found." }), { status: 404 });
  }

  if (
    (session.role === "STAFF" || session.role === "MANAGER") &&
    vehicle.buildingId !== session.buildingId
  ) {
    return new Response(JSON.stringify({ error: "That vehicle isn't in your building." }), {
      status: 403,
    });
  }

  const washDate = new Date(`${date}T00:00:00`);

  const existing = await prisma.washLog.findUnique({
    where: { vehicleId_washDate: { vehicleId, washDate } },
  });

  // Staff can't re-log an already-completed wash — only manager/admin can
  // override an existing entry (e.g. to correct a mistaken initial).
  if (existing && session.role === "STAFF") {
    return new Response(
      JSON.stringify({ error: "This wash is already logged. Ask a manager to make changes." }),
      { status: 409 }
    );
  }

  const log = existing
    ? await prisma.washLog.update({
        where: { id: existing.id },
        data: { initials: initials.trim().toUpperCase(), completedById: session.id },
      })
    : await prisma.washLog.create({
        data: {
          vehicleId,
          washDate,
          initials: initials.trim().toUpperCase(),
          completedById: session.id,
        },
      });

  return new Response(JSON.stringify(log), { status: 200 });
}

module.exports = { GET, POST };
