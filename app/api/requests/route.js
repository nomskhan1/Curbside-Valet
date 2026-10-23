const prisma = require("../../../lib/db");
const { getSessionFromRequest, renewSessionIfNeeded } = require("../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  // Active requests, plus pickups completed in the last 12 hours so the
  // queue can show a "Recently completed" list.
  const recentSince = new Date(Date.now() - 12 * 60 * 60 * 1000);
  // Requests a resident cancelled after a valet had already accepted them
  // (staff screens never cancel, so a cancelled request with a valet on it was
  // cancelled by the resident). Shown for 15 minutes so the valet can stop.
  const cancelSince = new Date(Date.now() - 15 * 60 * 1000);
  const queueStatus = {
    OR: [
      { status: { in: ["WAITING", "PULLING", "READY"] } },
      { status: "COMPLETED", completedAt: { gte: recentSince } },
      { status: "CANCELLED", handledById: { not: null }, completedAt: { gte: cancelSince } },
    ],
  };

  let where;
  if (session.role === "GUEST") {
    where = { requestedById: session.id };
  } else if (session.role === "STAFF" || session.role === "MANAGER") {
    // Staff and managers only see the active queue for their own building.
    where = {
      ...queueStatus,
      vehicle: { buildingId: session.buildingId || "__none__" }, // no buildingId = sees nothing, not everything
    };
  } else {
    // ADMIN scoped to their assigned buildings via AdminBuilding junction
    const adminBuildings = await prisma.adminBuilding.findMany({
      where: { adminId: session.id },
      select: { buildingId: true },
    });
    const buildingIds = adminBuildings.map(ab => ab.buildingId);
    where = {
      ...queueStatus,
      ...(buildingIds.length > 0 ? { vehicle: { buildingId: { in: buildingIds } } } : {}),
    };
  }

  const requests = await prisma.request.findMany({
    where,
    include: {
      vehicle: { include: { building: { select: { name: true } } } },
      requestedBy: { select: { name: true } },
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
  });

  // Screens poll this every few seconds, so it's also where sessions get
  // renewed — an always-on staff screen never signs itself out.
  const renewed = await renewSessionIfNeeded(session, prisma);
  return new Response(JSON.stringify(requests), {
    status: 200,
    headers: renewed ? { "Set-Cookie": renewed } : {},
  });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  const body = await req.json();
  const { vehicleId, ticketNumber, etaMinutes, scheduledFor, type } = body || {};
  const requestType = type === "CHARGE" ? "CHARGE" : "PICKUP";

  if (!vehicleId && !(ticketNumber && String(ticketNumber).trim())) {
    return new Response(JSON.stringify({ error: "vehicleId or ticketNumber is required." }), {
      status: 400,
    });
  }

  let vehicle;
  const ticket = ticketNumber ? String(ticketNumber).trim() : "";
  // Ticket numbers are unique per building, so a ticket lookup is always
  // scoped to a building: the requester's own building, or for an admin
  // without one, the building sent with the request.
  const ticketBuildingId = session.buildingId || body.buildingId || null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  } else if (ticketBuildingId) {
    vehicle = await prisma.vehicle.findFirst({
      where: { ticketNumber: ticket, buildingId: ticketBuildingId },
    });
  } else {
    const matches = await prisma.vehicle.findMany({ where: { ticketNumber: ticket }, take: 2 });
    if (matches.length > 1) {
      return new Response(
        JSON.stringify({ error: "That ticket number is used in more than one building. Please choose the building first." }),
        { status: 409 }
      );
    }
    vehicle = matches[0] || null;
  }

  // Ticket number with no matching vehicle yet — this is a resident
  // requesting pickup or charging for a visitor's car that's never been
  // entered into the system before. Just the ticket number is enough.
  if (!vehicle && ticket) {
    vehicle = await prisma.vehicle.create({
      data: {
        ticketNumber: ticket,
        ownerId: session.id,
        buildingId: ticketBuildingId,
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

  // Charging only makes sense for electric or plug-in hybrid vehicles —
  // but this only applies when a guest picks one of their own saved cars.
  // A ticket-based charging request (someone else's car, or a brand-new
  // visitor entry) is treated the same as a visitor pickup request: the
  // ticket itself is the proof, no fuel-type check needed.
  if (requestType === "CHARGE" && vehicleId && vehicle.fuelType === "GASOLINE") {
    return new Response(
      JSON.stringify({ error: "This vehicle isn't marked as electric or plug-in hybrid, so charging isn't available for it." }),
      { status: 400 }
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

  // Avoid duplicate requests of the SAME type for the same vehicle. A pickup
  // and a charge request are independent of each other. A pickup scheduled
  // for later doesn't block asking for the car right now (and the scheduled
  // one is kept), but a car can only have one request for right now and one
  // scheduled pickup at a time.
  const now = new Date();
  const isUpcoming = (r) => r.status === "WAITING" && r.scheduledFor && r.scheduledFor > now;
  const wantsLater = !!scheduledForDate && scheduledForDate > now;
  const activeSameType = await prisma.request.findMany({
    where: {
      vehicleId: vehicle.id,
      type: requestType,
      status: { in: ["WAITING", "PULLING", "READY"] },
    },
    select: { status: true, scheduledFor: true },
  });
  const conflict = activeSameType.find((r) => (wantsLater ? isUpcoming(r) : !isUpcoming(r)));
  if (conflict) {
    let error;
    if (wantsLater) {
      error = "This car already has a scheduled pickup. Cancel it first to choose a new time.";
    } else if (requestType === "CHARGE") {
      error = "There's already an active charging request for this car.";
    } else {
      error = "There's already an active pickup request for this car.";
    }
    return new Response(JSON.stringify({ error }), { status: 409 });
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
