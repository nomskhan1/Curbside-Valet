// Removes one or more accounts together with everything tied to them, so a
// removal never fails halfway because of old history.
//
// - Past requests a staff member handled, and wash logs they signed off,
//   stay in the history with no name attached.
// - Requests the account made, its cars, and those cars' requests and wash
//   logs are deleted.
// - Building assignments for admin accounts are removed.
//
// Everything runs in one transaction: either all listed accounts are
// removed, or none are.
async function deleteUsersWithData(prisma, userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;

  const vehicleIds = (
    await prisma.vehicle.findMany({ where: { ownerId: { in: ids } }, select: { id: true } })
  ).map((v) => v.id);

  const steps = [
    prisma.request.updateMany({ where: { handledById: { in: ids } }, data: { handledById: null } }),
    prisma.washLog.updateMany({ where: { completedById: { in: ids } }, data: { completedById: null } }),
    prisma.request.deleteMany({
      where: {
        OR: [
          { requestedById: { in: ids } },
          ...(vehicleIds.length ? [{ vehicleId: { in: vehicleIds } }] : []),
        ],
      },
    }),
  ];
  if (vehicleIds.length) {
    steps.push(prisma.washLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } }));
    steps.push(prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } }));
  }
  steps.push(prisma.adminBuilding.deleteMany({ where: { adminId: { in: ids } } }));
  steps.push(prisma.user.deleteMany({ where: { id: { in: ids } } }));

  const results = await prisma.$transaction(steps);
  return results[results.length - 1].count;
}

module.exports = { deleteUsersWithData };
