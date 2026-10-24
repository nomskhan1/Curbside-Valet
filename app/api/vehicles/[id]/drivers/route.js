const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// Adds another person from the car's monthly parking application, so they can
// see and request the car too. Admins and managers only.
async function POST(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return json({ error: "Admin or manager access required." }, 403);
  }

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) return json({ error: "Choose a person to add." }, 400);

  const vehicle = await prisma.vehicle.findUnique({ where: { id: params.id } });
  if (!vehicle) return json({ error: "Vehicle not found." }, 404);
  if (session.role === "MANAGER" && vehicle.buildingId !== session.buildingId) {
    return json({ error: "You can only change cars at your own building." }, 403);
  }
  if (vehicle.isVisitor) {
    return json({ error: "Visitor cars can't be shared." }, 400);
  }

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, buildingId: true },
  });
  if (!person) return json({ error: "That person wasn't found." }, 404);
  if (person.role !== "GUEST") {
    return json({ error: "Only monthly parkers can be added to a car." }, 400);
  }
  if (person.buildingId !== vehicle.buildingId) {
    return json({ error: "That person lives in a different building than this car." }, 400);
  }
  if (person.id === vehicle.ownerId) {
    return json({ error: `${person.name} is already the main name on this car.` }, 409);
  }

  const existing = await prisma.vehicleDriver.findUnique({
    where: { vehicleId_userId: { vehicleId: vehicle.id, userId: person.id } },
  });
  if (existing) return json({ error: `${person.name} is already on this car.` }, 409);

  await prisma.vehicleDriver.create({ data: { vehicleId: vehicle.id, userId: person.id } });
  return json({ ok: true }, 201);
}

module.exports = { POST };
