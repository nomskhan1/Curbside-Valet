const bcrypt = require("bcryptjs");
const prisma = require("../../../../lib/db");
const { signSession, sessionCookieHeader } = require("../../../../lib/auth");

// After this many wrong passwords in a row the account is locked for
// LOCK_MINUTES, which stops anyone from guessing passwords.
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function lockedMessage(until) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
  return `Too many wrong passwords. For security this account is locked — try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }, or ask your manager to reset your password.`;
}

async function POST(req) {
  const body = await req.json().catch(() => null);
  const { password } = body || {};
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  if (!username || !password) {
    return json({ error: "Username and password are required." }, 400);
  }

  // Capital letters don't matter: "Jsmith" (phones capitalize the first
  // letter) signs in as "jsmith". An exact match always wins; otherwise a
  // case-insensitive match is used only when it points to exactly one account.
  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    const matches = await prisma.user.findMany({
      where: { username: { equals: username, mode: "insensitive" } },
      take: 2,
    });
    if (matches.length === 1) user = matches[0];
  }
  if (!user) {
    return json({ error: "Incorrect username or password." }, 401);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return json({ error: lockedMessage(user.lockedUntil) }, 429);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failed = (user.failedLogins || 0) + 1;
    if (failed >= MAX_FAILED) {
      const until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: until },
      });
      return json({ error: lockedMessage(until) }, 429);
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed } });
    return json({ error: "Incorrect username or password." }, 401);
  }

  if (user.failedLogins || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  const token = signSession(user);
  return json(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    200,
    { "Set-Cookie": sessionCookieHeader(token) }
  );
}

module.exports = { POST };
