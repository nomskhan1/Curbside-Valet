const crypto = require("crypto");
const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");
const { vehicleAccessWhere } = require("../../../lib/vehicleAccess");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  let where;
  if (session.role === "GUEST") {
    // Their own cars plus cars they're named on (shared parking application).
    where = { ...vehicleAccessWhere(session.id), isVisitor: false };
  } else if (session.role === "STAFF" || session.role === "MANAGER") {
    where = { buildingId: session.buildingId || "__none__", isVisitor: false };
  } else {
    // ADMIN scoped to their assigned buildings via AdminBuilding junction
    const adminBuildings = await prisma.adminBuilding.findMany({
      where: { adminId: session.id },
      select: { buildingId: true },
    });
    const buildingIds = adminBuildings.map(ab => ab.buildingId);
    where = {
      isVisitor: false,
      ...(buildingIds.length > 0 ? { buildingId: { in: buildingIds } } : {}),
    };
  }

  const isGuest = session.role === "GUEST";
  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      owner: { select: isGuest ? { id: true, name: true } : { id: true, name: true, username: true, unitNumber: true } },
      building: { select: { id: true, name: true } },
      // Everyone else on the car's parking application.
      drivers: {
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          user: { select: isGuest ? { id: true, name: true } : { id: true, name: true, username: true, unitNumber: true } },
        },
      },
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
  const { make, model, color, licensePlate, ticketNumber, ownerId, fuelType, photoUrl, section, washDay, location } = body || {};

  if (!make || !model || !ticketNumber || !ownerId) {
    return new Response(
      JSON.stringify({ error: "Owner, make, model, and ticket number are required." }),
      { status: 400 }
    );
  }

  const VALID_FUEL_TYPES = ["GASOLINE", "ELECTRIC", "PLUGIN_HYBRID"];
  const resolvedFuelType = VALID_FUEL_TYPES.includes(fuelType) ? fuelType : "GASOLINE";

  const VALID_WASH_DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const resolvedWashDay = VALID_WASH_DAYS.includes(washDay) ? washDay : null;

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

  // Ticket numbers only need to be unique within the owner's building.
  const existing = await prisma.vehicle.findFirst({
    where: { ticketNumber, buildingId: owner.buildingId || null },
    include: { owner: { select: { name: true } } },
  });
  if (existing) {
    const who = existing.owner?.name && !existing.isVisitor ? ` to ${existing.owner.name}` : "";
    return new Response(
      JSON.stringify({
        error: `Decal #${ticketNumber} is already registered${who} at this building. If they share this car, add this person to it instead (Users → Edit → "Add to a car already on file").`,
      }),
      { status: 409 }
    );
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
      photoUrl: photoUrl || null,
      section: section || null,
      location: location || null,
      washDay: resolvedWashDay,
      // Secret token for the guest-facing QR code — 32 hex chars, effectively
      // unguessable. Generated once at creation and never changes.
      claimToken: crypto.randomBytes(16).toString("hex"),
    },
  });

  return new Response(JSON.stringify(vehicle), { status: 201 });
}

module.exports = { GET, POST };
