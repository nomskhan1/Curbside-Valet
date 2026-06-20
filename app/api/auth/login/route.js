const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { signSession, sessionCookieHeader } = require("../../../../lib/auth");

async function POST(req) {
  const body = await req.json();
  const { email, password } = body || {};

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email and password are required." }), {
      status: 400,
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return new Response(JSON.stringify({ error: "Incorrect email or password." }), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Incorrect email or password." }), { status: 401 });
  }

  const token = signSession(user);

  return new Response(
    JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }),
    {
      status: 200,
      headers: { "Set-Cookie": sessionCookieHeader(token), "Content-Type": "application/json" },
    }
  );
}

module.exports = { POST };
