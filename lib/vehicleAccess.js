// Who can see and request a car: the owner (first name on the monthly
// parking application) and anyone else named on that application
// (VehicleDriver rows).

// Prisma filter for cars a resident can use.
function vehicleAccessWhere(userId) {
  return { OR: [{ ownerId: userId }, { drivers: { some: { userId } } }] };
}

// True if this resident can use this car.
async function canUseVehicle(prisma, userId, vehicle) {
  if (!vehicle || !userId) return false;
  if (vehicle.ownerId === userId) return true;
  const row = await prisma.vehicleDriver.findUnique({
    where: { vehicleId_userId: { vehicleId: vehicle.id, userId } },
    select: { id: true },
  });
  return !!row;
}

// "Unit 1204", "#1204", "apt 1204" and "1204" all count as the same unit.
function normalizeUnit(unit) {
  return String(unit || "")
    .toLowerCase()
    .replace(/\b(unit|apt|apartment|suite|ste)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

module.exports = { vehicleAccessWhere, canUseVehicle, normalizeUnit };
