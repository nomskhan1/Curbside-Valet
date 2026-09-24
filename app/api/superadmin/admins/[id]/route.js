const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

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

module.exports = { DELETE };
