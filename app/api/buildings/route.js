const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

// Building list for filters in the dashboard. Requires sign-in so the list of
// client buildings and their addresses isn't public. Admins see the buildings
// assigned to them (all buildings if none are assigned, matching the queue);
// everyone else sees only their own building.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });
  }

  let where = {};
  if (session.role === "ADMIN") {
    const adminBuildings = await prisma.adminBuilding.findMany({
      where: { adminId: session.id },
      select: { buildingId: true },
    });
    const ids = adminBuildings.map((ab) => ab.buildingId);
    if (ids.length > 0) where = { id: { in: ids } };
  } else if (session.role !== "SUPER_ADMIN") {
    where = { id: session.buildingId || "__none__" };
  }

  const buildings = await prisma.building.findMany({
    where,
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  });
  return new Response(JSON.stringify(buildings), { status: 200 });
}

module.exports = { GET };
