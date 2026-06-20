const prisma = require("../../../lib/db");

// Public on purpose: a guest needs to pick their building before they have
// an account, so this can't require auth. Only exposes id/name/address —
// nothing sensitive.
async function GET() {
  const buildings = await prisma.building.findMany({
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  });
  return new Response(JSON.stringify(buildings), { status: 200 });
}

module.exports = { GET };
