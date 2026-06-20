const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
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
  const { email, password, name, role } = body || {};

  if (!email || !password || !name || !["GUEST", "STAFF", "ADMIN"].includes(role)) {
    return new Response(JSON.stringify({ error: "Name, email, password, and a valid role are required." }), {
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
    data: { email, passwordHash, name, role },
  });

  return new Response(
    JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }),
    { status: 201 }
  );
}

module.exports = { GET, POST };
