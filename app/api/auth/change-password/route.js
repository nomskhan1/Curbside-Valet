const prisma = require("../../../lib/db");
const { getSessionFromRequest, hashPassword, verifyPassword } = require("../../../lib/auth");

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });
  }

  const body = await req.json();
  const { currentPassword, newPassword } = body || {};

  if (!currentPassword || !newPassword) {
    return new Response(JSON.stringify({ error: "Both current and new password are required." }), { status: 400 });
  }

  if (newPassword.length < 6) {
    return new Response(JSON.stringify({ error: "New password must be at least 6 characters." }), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found." }), { status: 404 });
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Current password is incorrect." }), { status: 400 });
  }

  const newHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: session.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false, // Clear the flag after successful change
    },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

module.exports = { POST };
