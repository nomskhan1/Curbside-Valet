const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Not authorized." }), { status: 403 });
  }

  const { id } = params;
  const body = await req.json();
  const { buildingIds } = body || {};

  if (!Array.isArray(buildingIds)) {
    return new Response(JSON.stringify({ error: "buildingIds must be an array." }), { status: 400 });
  }

  // Set primary buildingId to first selected building
  const primaryBuildingId = buildingIds.length > 0 ? buildingIds[0] : null;

  // Delete existing AdminBuilding records and recreate
  await prisma.adminBuilding.deleteMany({ where: { adminId: id } });

  if (buildingIds.length > 0) {
    await prisma.adminBuilding.createMany({
      data: buildingIds.map(buildingId => ({ adminId: id, buildingId })),
    });
  }

  // Update primary buildingId on User
  const user = await prisma.user.update({
    where: { id },
    data: { buildingId: primaryBuildingId },
    include: {
      building: true,
      adminBuildings: { include: { building: true } },
    },
  });

  return new Response(JSON.stringify(user), { status: 200 });
}

async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Not authorized." }), { status: 403 });
  }

  const { id } = params;

  try {
    await prisma.adminBuilding.deleteMany({ where: { adminId: id } });
    await prisma.user.delete({ where: { id } });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to delete admin. " + err.message }), { status: 500 });
  }
}

module.exports = { PATCH, DELETE };
