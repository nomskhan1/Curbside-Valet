const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }

  const where = session.role === "MANAGER" ? { buildingId: session.buildingId || "__none__" } : {};

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
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
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }

  const body = await req.json();
  const { username, password, name } = body || {};
  let { role, buildingId } = body || {};

  // A manager can only create guest or staff accounts, and only for their
  // own building — admin and manager accounts stay admin-only to create.
  if (session.role === "MANAGER") {
    if (!["GUEST", "STAFF"].includes(role)) {
      return new Response(
        JSON.stringify({ error: "Managers can only create guest or staff accounts." }),
        { status: 403 }
      );
    }
    buildingId = session.buildingId;
    if (!buildingId) {
      return new Response(
        JSON.stringify({ error: "Your account isn't assigned to a building." }),
        { status: 400 }
      );
    }
  }

  if (!username || !password || !name || !["GUEST", "STAFF", "MANAGER", "ADMIN"].includes(role)) {
    return new Response(JSON.stringify({ error: "Name, username, password, and a valid role are required." }), {
      status: 400,
    });
  }

  // Staff, manager, and guest accounts must belong to a building. Admin
  // accounts are global, so a building is optional for them.
  if (role !== "ADMIN" && !buildingId) {
    return new Response(JSON.stringify({ error: "Please select a building for this account." }), {
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
  const user = await prisma.user.create({
    data: { username, passwordHash, name, role, buildingId: buildingId || null },
  });

  return new Response(
    JSON.stringify({ id: user.id, username: user.username, name: user.name, role: user.role }),
    { status: 201 }
  );
}

module.exports = { GET, POST };
