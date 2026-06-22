const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  let where;
  if (session.role === "GUEST") {
    where = { ownerId: session.id };
  } else if (session.role === "STAFF" || session.role === "MANAGER") {
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

  // Only an admin or a building manager can register vehicles — guests no
  // longer self-register; their vehicles are added for them.
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    return new Response(JSON.stringify({ error: "Only an admin or manager can add a vehicle." }), {
      status: 403,
    });
  }

  const body = await req.json();
  const { make, model, color, licensePlate, ticketNumber, ownerId, fuelType } = body || {};

  if (!make || !model || !ticketNumber || !ownerId) {
    return new Response(
      JSON.stringify({ error: "Owner, make, model, and ticket number are required." }),
      { status: 400 }
    );
  }

  const VALID_FUEL_TYPES = ["GASOLINE", "ELECTRIC", "PLUGIN_HYBRID"];
  const resolvedFuelType = VALID_FUEL_TYPES.includes(fuelType) ? fuelType : "GASOLINE";

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner) {
    return new Response(JSON.stringify({ error: "Selected user wasn't found." }), { status: 404 });
  }

  // A manager can only add vehicles for guests in their own building.
  if (session.role === "MANAGER" && owner.buildingId !== session.buildingId) {
    return new Response(
      JSON.stringify({ error: "You can only add vehicles for guests in your own building." }),
      { status: 403 }
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
      ownerId: owner.id,
      buildingId: owner.buildingId || null,
      fuelType: resolvedFuelType,
    },
  });

  return new Response(JSON.stringify(vehicle), { status: 201 });
}

module.exports = { GET, POST };
