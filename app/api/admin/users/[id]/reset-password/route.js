const bcrypt = require("bcryptjs");
const prisma = require("../../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../../lib/auth");
async function POST(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }

  const { id } = params;
  const body = await req.json();
  const { newPassword } = body || {};

  if (!newPassword || newPassword.length < 6) {
    return new Response(JSON.stringify({ error: "New password must be at least 6 characters." }), {
      status: 400,
    });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return new Response(JSON.stringify({ error: "Account not found." }), { status: 404 });
  }

  // A manager can only reset passwords for guest/staff in their own building.
  if (session.role === "MANAGER") {
    if (!["GUEST", "STAFF"].includes(target.role)) {
      return new Response(
        JSON.stringify({ error: "Managers can only reset passwords for guest or staff accounts." }),
        { status: 403 }
      );
    }
    if (target.buildingId !== session.buildingId) {
      return new Response(
        JSON.stringify({ error: "You can only reset passwords for accounts in your own building." }),
        { status: 403 }
      );
    }
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id },
    data: { passwordHash: newHash },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

module.exports = { POST };
