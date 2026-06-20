const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const buildings = await prisma.building.findMany({
    include: {
      _count: { select: { users: true, vehicles: true } },
    },
    orderBy: { name: "asc" },
  });

  return new Response(JSON.stringify(buildings), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const body = await req.json();
  const { name, address } = body || {};

  if (!name) {
    return new Response(JSON.stringify({ error: "Building name is required." }), { status: 400 });
  }

  const building = await prisma.building.create({
    data: { name, address: address || null },
  });

  return new Response(JSON.stringify(building), { status: 201 });
}

module.exports = { GET, POST };
