const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  const where =
    session.role === "GUEST"
      ? { requestedById: session.id }
      : { status: { in: ["WAITING", "PULLING", "READY"] } }; // staff/admin see the active queue

  const requests = await prisma.request.findMany({
    where,
    include: { vehicle: true, requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return new Response(JSON.stringify(requests), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  const body = await req.json();
  const { vehicleId, etaMinutes } = body || {};

  if (!vehicleId) {
    return new Response(JSON.stringify({ error: "vehicleId is required." }), { status: 400 });
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    return new Response(JSON.stringify({ error: "Vehicle not found." }), { status: 404 });
  }
  if (session.role === "GUEST" && vehicle.ownerId !== session.id) {
    return new Response(JSON.stringify({ error: "That vehicle isn't linked to your account." }), {
      status: 403,
    });
  }

  // Avoid duplicate active requests for the same vehicle.
  const activeExisting = await prisma.request.findFirst({
    where: { vehicleId, status: { in: ["WAITING", "PULLING", "READY"] } },
  });
  if (activeExisting) {
    return new Response(JSON.stringify({ error: "There's already an active request for this car." }), {
      status: 409,
    });
  }

  const request = await prisma.request.create({
    data: {
      vehicleId,
      requestedById: session.id,
      etaMinutes: etaMinutes ?? 0,
      status: "WAITING",
    },
    include: { vehicle: true },
  });

  return new Response(JSON.stringify(request), { status: 201 });
}

module.exports = { GET, POST };
