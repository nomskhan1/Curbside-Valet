const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// GET /api/washes/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin sees every building; manager sees only their own.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || !["ADMIN", "MANAGER"].includes(session.role)) {
    return new Response(JSON.stringify({ error: "Manager access required." }), { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const where = {};
  if (fromParam || toParam) {
    where.washDate = {};
    if (fromParam) {
      const fromDate = new Date(`${fromParam}T00:00:00`);
      if (!isNaN(fromDate.getTime())) where.washDate.gte = fromDate;
    }
    if (toParam) {
      const toDate = new Date(`${toParam}T23:59:59`);
      if (!isNaN(toDate.getTime())) where.washDate.lte = toDate;
    }
  }

  if (session.role === "MANAGER") {
    where.vehicle = { buildingId: session.buildingId || "__none__" };
  }

  const logs = await prisma.washLog.findMany({
    where,
    include: {
      vehicle: {
        include: { owner: { select: { name: true } }, building: { select: { name: true } } },
      },
      completedBy: { select: { name: true } },
    },
    orderBy: { washDate: "desc" },
    take: 500,
  });

  return new Response(JSON.stringify(logs), { status: 200 });
}

module.exports = { GET };
