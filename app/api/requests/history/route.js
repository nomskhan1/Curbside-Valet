const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Returns request history (completed + cancelled), newest first.
// Admin sees every building; staff/manager see only their own building.
// Optional query params: ?from=2026-01-01&to=2026-01-31 to filter by date.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || !["ADMIN", "MANAGER", "STAFF"].includes(session.role)) {
    return new Response(JSON.stringify({ error: "Staff access required." }), { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const where = { status: { in: ["COMPLETED", "CANCELLED"] } };

  // Staff and managers only see history for their own building — same
  // scoping the live queue uses. No buildingId means they see nothing,
  // not everything.
  if (session.role === "STAFF" || session.role === "MANAGER") {
    where.vehicle = { buildingId: session.buildingId || "__none__" };
  }

  if (fromParam || toParam) {
    // Filter by when the request was actually completed/cancelled, not
    // when it was originally created — a request made late one day and
    // completed the next should show up under the day it finished.
    // completedAt isn't set for cancelled requests, so fall back to
    // updatedAt (the moment the status last changed) for those.
    //
    // -06:00 is US Central Standard Time — matches Integral Revenue's day
    // boundary. During Central Daylight Time this is off by an hour at the
    // day's edges, which is fine for a same-day report but flag it if exact
    // DST handling matters.
    const dateFilter = {};
    if (fromParam) {
      const fromDate = new Date(`${fromParam}T00:00:00-06:00`);
      if (!isNaN(fromDate.getTime())) dateFilter.gte = fromDate;
    }
    if (toParam) {
      const toDate = new Date(`${toParam}T23:59:59-06:00`);
      if (!isNaN(toDate.getTime())) dateFilter.lte = toDate;
    }
    where.OR = [
      { status: "COMPLETED", completedAt: dateFilter },
      { status: "CANCELLED", updatedAt: dateFilter },
    ];
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
