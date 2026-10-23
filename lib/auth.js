const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "curbside_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
// When a session has less than this left, it's renewed automatically on the
// next request. A screen that stays open (like the garage monitor) keeps
// renewing and never signs itself out.
const RENEW_WHEN_LEFT = 60 * 60 * 24 * 15; // 15 days

function signSession(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      buildingId: user.buildingId || null,
    },
    SECRET,
    { expiresIn: MAX_AGE }
  );
}

function verifySession(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// Parses the session cookie out of a Next.js Request (App Router).
function getSessionFromRequest(req) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie) return null;
  return verifySession(cookie.value);
}

function sessionCookieHeader(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Returns a fresh Set-Cookie header when the session is getting old, or null
// when no renewal is needed. The user is re-read from the database so a
// deleted account isn't renewed and role/building changes are picked up.
async function renewSessionIfNeeded(session, prisma) {
  if (!session || !session.exp) return null;
  const secondsLeft = session.exp - Math.floor(Date.now() / 1000);
  if (secondsLeft > RENEW_WHEN_LEFT) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, username: true, name: true, role: true, buildingId: true },
    });
    if (!user) return null;
    return sessionCookieHeader(signSession(user));
  } catch {
    return null;
  }
}

module.exports = {
  COOKIE_NAME,
  signSession,
  verifySession,
  getSessionFromRequest,
  sessionCookieHeader,
  clearCookieHeader,
  renewSessionIfNeeded,
};
