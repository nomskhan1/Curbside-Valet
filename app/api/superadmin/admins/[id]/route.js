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

  // For simplicity, assign the first buildingId as the primary building
  // (the schema has a single buildingId on User)
  const primaryBuildingId = buildingIds.length > 0 ? buildingIds[0] : null;

  const user = await prisma.user.update({
    where: { id },
    data: { buildingId: primaryBuildingId },
    include: { building: true },
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
    await prisma.user.delete({ where: { id } });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("Delete admin error:", err);
    return new Response(JSON.stringify({ error: "Failed to delete admin. " + err.message }), { status: 500 });
  }
}

module.exports = { PATCH, DELETE };
