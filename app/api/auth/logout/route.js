const { clearCookieHeader } = require("../../../../lib/auth");

async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Set-Cookie": clearCookieHeader(), "Content-Type": "application/json" },
  });
}

module.exports = { POST };
