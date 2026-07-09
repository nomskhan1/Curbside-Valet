const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Super Admin's own narrow lane: create garages/buildings and set their
// logo. Deliberately separate from the existing /api/buildings route used
// by ADMIN, so nothing about ADMIN's behavior is touched by this file.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Super Admin access required." }), { status: 403 });
  }

  const buildings = await prisma.building.findMany({
    include: {
      users: {
        where: { role: "ADMIN" },
        select: { id: true, name: true, username: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return new Response(JSON.stringify(buildings), { status: 200 });
}

async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Super Admin access required." }), { status: 403 });
  }

  const body = await req.json();
  const { name, address, logoUrl } = body || {};
  if (!name || !name.trim()) {
    return new Response(JSON.stringify({ error: "Garage name is required." }), { status: 400 });
  }

  const building = await prisma.building.create({
    data: {
      name: name.trim(),
      address: address || null,
      logoUrl: logoUrl || null,
    },
  });

  return new Response(JSON.stringify(building), { status: 201 });
}

module.exports = { GET, POST };
