const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Returns the full request history (completed + cancelled), newest first.
// Admin-only — staff use /api/requests for the live active queue instead.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const history = await prisma.request.findMany({
    where: { status: { in: ["COMPLETED", "CANCELLED"] } },
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
