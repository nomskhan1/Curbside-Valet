const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      building: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return new Response(JSON.stringify(users), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const body = await req.json();
  const { email, password, name, role, buildingId } = body || {};

  if (!email || !password || !name || !["GUEST", "STAFF", "ADMIN"].includes(role)) {
    return new Response(JSON.stringify({ error: "Name, email, password, and a valid role are required." }), {
      status: 400,
    });
  }

  // Staff and guest accounts must belong to a building. Admin accounts are
  // global, so a building is optional for them.
  if ((role === "STAFF" || role === "GUEST") && !buildingId) {
    return new Response(JSON.stringify({ error: "Please select a building for this account." }), {
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
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role, buildingId: buildingId || null },
  });

  return new Response(
    JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }),
    { status: 201 }
  );
}

module.exports = { GET, POST };
