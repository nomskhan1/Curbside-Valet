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
  await prisma.washLog.deleteMany({ where: { vehicleId: id } });
  await prisma.vehicle.delete({ where: { id } });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }

  const { id } = params;
  const body = await req.json();
  const { make, model, color, licensePlate, ticketNumber, fuelType, photoUrl, section, washDay, location } =
    body || {};

  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) {
    return new Response(JSON.stringify({ error: "Vehicle not found." }), { status: 404 });
  }

  // A manager can only edit vehicles registered at their own building.
  if (session.role === "MANAGER" && vehicle.buildingId !== session.buildingId) {
    return new Response(
      JSON.stringify({ error: "You can only edit vehicles at your own building." }),
      { status: 403 }
    );
  }

  const data = {};
  if (make !== undefined) data.make = make || null;
  if (model !== undefined) data.model = model || null;
  if (color !== undefined) data.color = color || null;
  if (licensePlate !== undefined) data.licensePlate = licensePlate || null;
  if (fuelType && ["GASOLINE", "ELECTRIC", "PLUGIN_HYBRID"].includes(fuelType)) {
    data.fuelType = fuelType;
  }
  if (photoUrl !== undefined) data.photoUrl = photoUrl || null;
  if (section !== undefined) data.section = section || null;
  if (location !== undefined) data.location = location || null;

  const VALID_WASH_DAYS = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  if (washDay !== undefined) {
    data.washDay = VALID_WASH_DAYS.includes(washDay) ? washDay : null;
  }

  if (ticketNumber && ticketNumber !== vehicle.ticketNumber) {
    const existing = await prisma.vehicle.findUnique({ where: { ticketNumber } });
    if (existing) {
      return new Response(JSON.stringify({ error: "That ticket number is already in use." }), {
        status: 409,
      });
    }
    data.ticketNumber = ticketNumber;
  }

  const updated = await prisma.vehicle.update({
    where: { id },
    data,
    include: { owner: { select: { name: true, username: true } }, building: { select: { name: true } } },
  });

  return new Response(JSON.stringify(updated), { status: 200 });
}

module.exports = { DELETE, PATCH };
