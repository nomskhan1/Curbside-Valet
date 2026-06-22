const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  let where;
  if (session.role === "GUEST") {
    where = { requestedById: session.id };
  } else if (session.role === "STAFF" || session.role === "MANAGER") {
    // Staff and managers only see the active queue for their own building.
    where = {
      status: { in: ["WAITING", "PULLING", "READY"] },
      vehicle: { buildingId: session.buildingId || "__none__" }, // no buildingId = sees nothing, not everything
    };
  } else {
    // ADMIN sees the active queue across every building.
    where = { status: { in: ["WAITING", "PULLING", "READY"] } };
  }

  const requests = await prisma.request.findMany({
    where,
    include: {
      vehicle: { include: { building: { select: { name: true } } } },
      requestedBy: { select: { name: true } },
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
  });

  return new Response(JSON.stringify(requests), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  const body = await req.json();
  const { vehicleId, ticketNumber, etaMinutes, scheduledFor, type } = body || {};
  const requestType = type === "CHARGE" ? "CHARGE" : "PICKUP";

  if (!vehicleId && !ticketNumber) {
    return new Response(JSON.stringify({ error: "vehicleId or ticketNumber is required." }), {
      status: 400,
    });
  }

  let vehicle;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  } else {
    vehicle = await prisma.vehicle.findUnique({ where: { ticketNumber: ticketNumber.trim() } });
  }

  // Ticket number with no matching vehicle yet — this is a resident
  // requesting pickup for a visitor's car that's never been entered into
  // the system before. Just the ticket number is enough; staff can fill in
  // car details later if they ever need to.
  if (!vehicle && ticketNumber) {
    vehicle = await prisma.vehicle.create({
      data: {
        ticketNumber: ticketNumber.trim(),
        ownerId: session.id,
        buildingId: session.buildingId || null,
        isVisitor: true,
      },
    });
  }

  if (!vehicle) {
    return new Response(
      JSON.stringify({
        error: ticketNumber
          ? "No vehicle found with that ticket number."
          : "Vehicle not found.",
      }),
      { status: 404 }
    );
  }

  // Guests requesting by their own saved vehicle must own it. Guests
  // requesting by ticket number don't need to — the ticket itself is the
  // proof, same as handing a physical valet stub to any staff member.
  if (session.role === "GUEST" && vehicleId && vehicle.ownerId !== session.id) {
    return new Response(JSON.stringify({ error: "That vehicle isn't linked to your account." }), {
      status: 403,
    });
  }

  // Ticket-based requests must be for a vehicle in the guest's own building.
  if (session.role === "GUEST" && ticketNumber && vehicle.buildingId !== session.buildingId) {
    return new Response(
      JSON.stringify({ error: "That ticket number isn't registered at your building." }),
      { status: 403 }
    );
  }

  // Avoid duplicate active requests of the SAME type for the same vehicle.
  // A pickup and a charge request can both be active at once — they're
  // independent of each other.
  const activeExisting = await prisma.request.findFirst({
    where: {
      vehicleId: vehicle.id,
      type: requestType,
      status: { in: ["WAITING", "PULLING", "READY"] },
    },
  });
  if (activeExisting) {
    return new Response(
      JSON.stringify({
        error:
          requestType === "CHARGE"
            ? "There's already an active charging request for this car."
            : "There's already an active pickup request for this car.",
      }),
      { status: 409 }
    );
  }

  let scheduledForDate = null;
  if (scheduledFor) {
    scheduledForDate = new Date(scheduledFor);
    if (isNaN(scheduledForDate.getTime())) {
      return new Response(JSON.stringify({ error: "Invalid scheduled time." }), { status: 400 });
    }
    if (scheduledForDate.getTime() < Date.now() - 60000) {
      return new Response(JSON.stringify({ error: "Scheduled time must be in the future." }), {
        status: 400,
      });
    }
  }

  const request = await prisma.request.create({
    data: {
      vehicleId: vehicle.id,
      requestedById: session.id,
      etaMinutes: etaMinutes ?? 0,
      status: "WAITING",
      type: requestType,
      scheduledFor: scheduledForDate,
    },
    include: { vehicle: true },
  });

  return new Response(JSON.stringify(request), { status: 201 });
}

module.exports = { GET, POST };
