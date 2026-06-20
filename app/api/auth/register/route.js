const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { signSession, sessionCookieHeader } = require("../../../../lib/auth");

async function POST(req) {
  const body = await req.json();
  const { email, password, name, buildingId } = body || {};

  if (!email || !password || !name || !buildingId) {
    return new Response(
      JSON.stringify({ error: "Name, email, password, and building are required." }),
      { status: 400 }
    );
  }

  const building = await prisma.building.findUnique({ where: { id: buildingId } });
  if (!building) {
    return new Response(JSON.stringify({ error: "Selected building wasn't found." }), {
      status: 400,
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return new Response(JSON.stringify({ error: "An account with this email already exists." }), {
      status: 409,
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Self-service signups are always GUEST. Staff/admin accounts are created
  // by an admin via /api/admin/users.
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: "GUEST", buildingId },
  });

  const token = signSession(user);

  return new Response(
    JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }),
    {
      status: 201,
      headers: { "Set-Cookie": sessionCookieHeader(token), "Content-Type": "application/json" },
    }
  );
}

module.exports = { POST };
