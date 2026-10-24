const prisma = require("../../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../../lib/auth");

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// Takes a person off a car's parking application. They can no longer see or
// request the car. The car's main name (owner) can't be removed this way.
async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return json({ error: "Admin or manager access required." }, 403);
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: params.id } });
  if (!vehicle) return json({ error: "Vehicle not found." }, 404);
  if (session.role === "MANAGER" && vehicle.buildingId !== session.buildingId) {
    return json({ error: "You can only change cars at your own building." }, 403);
  }
  if (params.userId === vehicle.ownerId) {
    return json({ error: "The main name can't be taken off the car. Remove the car or the account instead." }, 400);
  }

  const result = await prisma.vehicleDriver.deleteMany({
    where: { vehicleId: vehicle.id, userId: params.userId },
  });
  if (result.count === 0) return json({ error: "That person isn't on this car." }, 404);
  return json({ ok: true }, 200);
}

module.exports = { DELETE };
