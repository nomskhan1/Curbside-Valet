const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  let where;
  if (session.role === "GUEST") {
    where = { ownerId: session.id };
  } else if (session.role === "STAFF") {
    where = { buildingId: session.buildingId || "__none__" };
  } else {
    where = {}; // ADMIN sees every building
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      owner: { select: { name: true, username: true } },
      building: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return new Response(JSON.stringify(vehicles), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  const body = await req.json();
  const { make, model, color, licensePlate, ticketNumber } = body || {};

  if (!make || !model || !ticketNumber) {
    return new Response(
      JSON.stringify({ error: "Make, model, and ticket number are required." }),
      { status: 400 }
    );
  }

  const existing = await prisma.vehicle.findUnique({ where: { ticketNumber } });
  if (existing) {
    return new Response(JSON.stringify({ error: "That ticket number is already in use." }), {
      status: 409,
    });
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      make,
      model,
      color: color || null,
      licensePlate: licensePlate || null,
      ticketNumber,
      ownerId: session.id, // a guest registers their own car
      buildingId: session.buildingId || null,
    },
  });

  return new Response(JSON.stringify(vehicle), { status: 201 });
}

module.exports = { GET, POST };
