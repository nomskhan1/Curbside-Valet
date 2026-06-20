const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { signSession, sessionCookieHeader } = require("../../../../lib/auth");

async function POST(req) {
  const body = await req.json();
  const { username, password } = body || {};

  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Username and password are required." }), {
      status: 400,
    });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return new Response(JSON.stringify({ error: "Incorrect username or password." }), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Incorrect username or password." }), { status: 401 });
  }

  const token = signSession(user);

  return new Response(
    JSON.stringify({ id: user.id, username: user.username, name: user.name, role: user.role }),
    {
      status: 200,
      headers: { "Set-Cookie": sessionCookieHeader(token), "Content-Type": "application/json" },
    }
  );
}

module.exports = { POST };
