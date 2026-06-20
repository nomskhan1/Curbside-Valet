const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { signSession, sessionCookieHeader } = require("../../../../lib/auth");

async function POST(req) {
  const body = await req.json();
  const { username, password, name, buildingId } = body || {};

  if (!username || !password || !name || !buildingId) {
    return new Response(
      JSON.stringify({ error: "Name, username, password, and building are required." }),
      { status: 400 }
    );
  }

  const building = await prisma.building.findUnique({ where: { id: buildingId } });
  if (!building) {
    return new Response(JSON.stringify({ error: "Selected building wasn't found." }), {
      status: 400,
    });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return new Response(JSON.stringify({ error: "That username is already taken." }), {
      status: 409,
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Self-service signups are always GUEST. Staff/admin accounts are created
  // by an admin via /api/admin/users.
  const user = await prisma.user.create({
    data: { username, passwordHash, name, role: "GUEST", buildingId },
  });

  const token = signSession(user);

  return new Response(
    JSON.stringify({ id: user.id, username: user.username, name: user.name, role: user.role }),
    {
      status: 201,
      headers: { "Set-Cookie": sessionCookieHeader(token), "Content-Type": "application/json" },
    }
  );
}

module.exports = { POST };
