const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "curbside_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function signSession(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
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

module.exports = {
  COOKIE_NAME,
  signSession,
  verifySession,
  getSessionFromRequest,
  sessionCookieHeader,
  clearCookieHeader,
};
