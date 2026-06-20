const { getSessionFromRequest } = require("../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ user: null }), { status: 200 });
  }
  return new Response(JSON.stringify({ user: session }), { status: 200 });
}

module.exports = { GET };
