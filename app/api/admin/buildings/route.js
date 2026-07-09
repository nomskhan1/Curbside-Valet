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

// Creating new garages/buildings is Super Admin's job now (see
// /api/superadmin/buildings) — Admin can view and manage the buildings
// they're already assigned to, but can no longer add new ones.
async function POST(req) {
  return new Response(
    JSON.stringify({ error: "Only Super Admin can add new buildings." }),
    { status: 403 }
  );
}

module.exports = { GET, POST };
