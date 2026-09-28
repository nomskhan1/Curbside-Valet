const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ user: null }), { status: 200 });
  }

  // Fetch fresh user data from DB to include mustChangePassword flag
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      buildingId: true,
      unitNumber: true,
      mustChangePassword: true,
      building: {
        select: { id: true, name: true, logoUrl: true }
      },
    },
  });

  if (!user) {
    return new Response(JSON.stringify({ user: null }), { status: 200 });
  }

  return new Response(JSON.stringify({ user }), { status: 200 });
}

module.exports = { GET };
