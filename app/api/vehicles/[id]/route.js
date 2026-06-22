const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }

  const { id } = params;

  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) {
    return new Response(JSON.stringify({ error: "Vehicle not found." }), { status: 404 });
  }

  // A manager can only remove vehicles registered at their own building.
  if (session.role === "MANAGER" && vehicle.buildingId !== session.buildingId) {
    return new Response(
      JSON.stringify({ error: "You can only remove vehicles at your own building." }),
      { status: 403 }
    );
  }

  const activeCount = await prisma.request.count({
    where: { vehicleId: id, status: { in: ["WAITING", "PULLING", "READY"] } },
  });
  if (activeCount > 0) {
    return new Response(
      JSON.stringify({
        error: "This vehicle has an active request right now. Wait for it to finish or cancel it first.",
      }),
      { status: 409 }
    );
  }

  // Clear out completed/cancelled request history tied to this vehicle, then
  // the vehicle itself.
  await prisma.request.deleteMany({ where: { vehicleId: id } });
  await prisma.vehicle.delete({ where: { id } });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

module.exports = { DELETE };
