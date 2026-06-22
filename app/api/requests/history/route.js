const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Returns the full request history (completed + cancelled), newest first.
// Admin-only — staff use /api/requests for the live active queue instead.
// Optional query params: ?from=2026-01-01&to=2026-01-31 to filter by date.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const where = { status: { in: ["COMPLETED", "CANCELLED"] } };

  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (!isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
    }
    if (toParam) {
      // Include the whole "to" day by pushing to the end of that day.
      const toDate = new Date(toParam);
      if (!isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
  }

  const history = await prisma.request.findMany({
    where,
    include: {
      vehicle: { include: { building: { select: { name: true } } } },
      requestedBy: { select: { name: true, username: true } },
      handledBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200, // cap so the page stays fast as history grows
  });

  return new Response(JSON.stringify(history), { status: 200 });
}

module.exports = { GET };
