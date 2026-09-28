const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.role)) {
    return new Response(JSON.stringify({ error: "Not authorized." }), { status: 403 });
  }

  const { id } = params;
  const body = await req.json();
  const { hasCarWash, hasEvCharging } = body || {};

  const data = {};
  if (hasCarWash !== undefined) data.hasCarWash = hasCarWash;
  if (hasEvCharging !== undefined) data.hasEvCharging = hasEvCharging;

  const building = await prisma.building.update({
    where: { id },
    data,
  });

  return new Response(JSON.stringify(building), { status: 200 });
}

async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Not authorized." }), { status: 403 });
  }

  const { id } = params;

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { buildingId: id },
      select: { id: true },
    });
    const vehicleIds = vehicles.map(v => v.id);

    await prisma.request.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.washLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { buildingId: id } });
    await prisma.user.deleteMany({ where: { buildingId: id } });
    await prisma.building.delete({ where: { id } });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("Delete building error:", err);
    return new Response(JSON.stringify({ error: "Failed to delete garage. " + err.message }), { status: 500 });
  }
}

module.exports = { PATCH, DELETE };
