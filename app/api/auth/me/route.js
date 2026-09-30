const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ user: null }), { status: 200 });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        mustChangePassword: true,
        building: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            hasCarWash: true,
            hasEvCharging: true,
          },
        },
      },
    });

    return new Response(JSON.stringify({
      user: {
        ...session,
        mustChangePassword: dbUser?.mustChangePassword || false,
        building: dbUser?.building || session.building || null,
      }
    }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ user: session }), { status: 200 });
  }
}

module.exports = { GET };
