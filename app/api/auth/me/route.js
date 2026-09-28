const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ user: null }), { status: 200 });
  }

  // Fetch mustChangePassword from DB — everything else comes from session
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { mustChangePassword: true },
    });
    return new Response(JSON.stringify({
      user: { ...session, mustChangePassword: dbUser?.mustChangePassword || false }
    }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ user: session }), { status: 200 });
  }
}

module.exports = { GET };
