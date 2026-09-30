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
        adminBuildings: {
          include: {
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
        },
      },
    });

    // Build list of all building IDs this admin is assigned to
    const adminBuildingIds = dbUser?.adminBuildings?.map(ab => ab.buildingId) || [];

    return new Response(JSON.stringify({
      user: {
        ...session,
        mustChangePassword: dbUser?.mustChangePassword || false,
        building: dbUser?.building || session.building || null,
        adminBuildings: dbUser?.adminBuildings || [],
        adminBuildingIds,
      }
    }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ user: session }), { status: 200 });
  }
}

module.exports = { GET };
