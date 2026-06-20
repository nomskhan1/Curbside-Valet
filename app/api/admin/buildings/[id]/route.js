const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const { id } = params;
  const body = await req.json();
  const { name, address } = body || {};

  const updated = await prisma.building.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(address !== undefined ? { address } : {}),
    },
  });

  return new Response(JSON.stringify(updated), { status: 200 });
}

async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const { id } = params;

  const usersAttached = await prisma.user.count({ where: { buildingId: id } });
  if (usersAttached > 0) {
    return new Response(
      JSON.stringify({
        error: `Can't delete — ${usersAttached} account(s) are still assigned to this building. Reassign or remove them first.`,
      }),
      { status: 409 }
    );
  }

  await prisma.building.delete({ where: { id } });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

module.exports = { PATCH, DELETE };
