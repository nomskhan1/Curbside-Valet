const prisma = require("../../../../lib/db");

// Public — no session required. The claimToken itself is the credential,
// same as handing a physical valet stub to staff.

async function GET(req, { params }) {
  const { token } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token." }), { status: 400 });
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { claimToken: token },
    include: { building: { select: { name: true } } },
  });

  if (!vehicle) {
    return new Response(JSON.stringify({ error: "This QR code isn't valid or has expired." }), {
      status: 404,
    });
  }

  // Is there already an active request for this vehicle?
  const activeRequest = await prisma.request.findFirst({
    where: {
      vehicleId: vehicle.id,
      type: "PICKUP",
      status: { in: ["WAITING", "PULLING", "READY"] },
    },
    orderBy: { createdAt: "desc" },
  });

  return new Response(
    JSON.stringify({
      vehicle: {
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        licensePlate: vehicle.licensePlate,
        ticketNumber: vehicle.ticketNumber,
        building: vehicle.building?.name || null,
      },
      activeRequest: activeRequest
        ? { status: activeRequest.status, createdAt: activeRequest.createdAt }
        : null,
    }),
    { status: 200 }
  );
}

async function POST(req, { params }) {
  const { token } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token." }), { status: 400 });
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { claimToken: token } });
  if (!vehicle) {
    return new Response(JSON.stringify({ error: "This QR code isn't valid or has expired." }), {
      status: 404,
    });
  }

  const activeExisting = await prisma.request.findFirst({
    where: {
      vehicleId: vehicle.id,
      type: "PICKUP",
      status: { in: ["WAITING", "PULLING", "READY"] },
    },
  });
  if (activeExisting) {
    return new Response(
      JSON.stringify({ error: "This car has already been requested — sit tight!" }),
      { status: 409 }
    );
  }

  const request = await prisma.request.create({
    data: {
      vehicleId: vehicle.id,
      requestedById: vehicle.ownerId,
      etaMinutes: 0,
      status: "WAITING",
      type: "PICKUP",
    },
    include: { vehicle: true },
  });

  return new Response(JSON.stringify(request), { status: 201 });
}

module.exports = { GET, POST };
