const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Super Admin's only account-creation power: making an Admin account and
// assigning it to one garage. Does not touch /api/admin/users (the
// existing ADMIN-facing account creation route) at all.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Super Admin access required." }), { status: 403 });
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: {
      id: true,
      name: true,
      username: true,
      createdAt: true,
      building: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return new Response(JSON.stringify(admins), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Super Admin access required." }), { status: 403 });
  }

  const body = await req.json();
  const { name, username, password, buildingId } = body || {};
  if (!name || !username || !password || !buildingId) {
    return new Response(
      JSON.stringify({ error: "Name, username, password, and garage are all required." }),
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), {
      status: 400,
    });
  }

  const building = await prisma.building.findUnique({ where: { id: buildingId } });
  if (!building) {
    return new Response(JSON.stringify({ error: "Garage not found." }), { status: 404 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return new Response(JSON.stringify({ error: "That username is already taken." }), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      name,
      username,
      passwordHash,
      role: "ADMIN",
      buildingId,
    },
    select: { id: true, name: true, username: true, building: { select: { name: true } } },
  });

  return new Response(JSON.stringify(admin), { status: 201 });
}

module.exports = { GET, POST };
