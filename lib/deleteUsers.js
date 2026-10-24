// Removes one or more accounts together with everything tied to them, so a
// removal never fails halfway because of old history.
//
// - Past requests a staff member handled, and wash logs they signed off,
//   stay in the history with no name attached.
// - Requests the account made are deleted.
// - Cars: a car shared with someone who is staying (another name on the
//   parking application) is kept and handed to that person. A car nobody
//   else is on is deleted, with its requests and wash logs.
// - Building assignments for admin accounts are removed.
//
// Everything runs in one transaction: either all listed accounts are
// removed, or none are.
async function deleteUsersWithData(prisma, userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  const leaving = new Set(ids);

  const owned = await prisma.vehicle.findMany({
    where: { ownerId: { in: ids } },
    select: {
      id: true,
      drivers: { select: { id: true, userId: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const transfers = [];
  const deleteVehicleIds = [];
  for (const v of owned) {
    const next = v.drivers.find((d) => !leaving.has(d.userId));
    if (next) transfers.push({ vehicleId: v.id, newOwnerId: next.userId, driverRowId: next.id });
    else deleteVehicleIds.push(v.id);
  }

  const steps = [
    prisma.request.updateMany({ where: { handledById: { in: ids } }, data: { handledById: null } }),
    prisma.washLog.updateMany({ where: { completedById: { in: ids } }, data: { completedById: null } }),
    // Take the leaving people off any cars they share with others.
    prisma.vehicleDriver.deleteMany({ where: { userId: { in: ids } } }),
  ];
  // Hand shared cars to the next person on the application.
  for (const t of transfers) {
    steps.push(prisma.vehicleDriver.delete({ where: { id: t.driverRowId } }));
    steps.push(prisma.vehicle.update({ where: { id: t.vehicleId }, data: { ownerId: t.newOwnerId } }));
  }
  steps.push(
    prisma.request.deleteMany({
      where: {
        OR: [
          { requestedById: { in: ids } },
          ...(deleteVehicleIds.length ? [{ vehicleId: { in: deleteVehicleIds } }] : []),
        ],
      },
    })
  );
  if (deleteVehicleIds.length) {
    steps.push(prisma.washLog.deleteMany({ where: { vehicleId: { in: deleteVehicleIds } } }));
    steps.push(prisma.vehicleDriver.deleteMany({ where: { vehicleId: { in: deleteVehicleIds } } }));
    steps.push(prisma.vehicle.deleteMany({ where: { id: { in: deleteVehicleIds } } }));
  }
  steps.push(prisma.adminBuilding.deleteMany({ where: { adminId: { in: ids } } }));
  steps.push(prisma.user.deleteMany({ where: { id: { in: ids } } }));

  const results = await prisma.$transaction(steps);
  return results[results.length - 1].count;
}

module.exports = { deleteUsersWithData };
