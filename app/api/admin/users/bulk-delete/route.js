const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");
const { deleteUsersWithData } = require("../../../../../lib/deleteUsers");

const MAX_PER_REQUEST = 1000;

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// Removes several accounts at once from the Users screen.
// Same rules as removing one account, plus one safety rule: admin accounts
// are never removed in bulk — those are removed one at a time.
async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return json({ error: "Admin or manager access required." }, 403);
  }

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x) => typeof x === "string" && x))] : [];
  if (ids.length === 0) {
    return json({ error: "Select at least one account to remove." }, 400);
  }
  if (ids.length > MAX_PER_REQUEST) {
    return json({ error: `You can remove up to ${MAX_PER_REQUEST} accounts at a time.` }, 400);
  }

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true, buildingId: true },
  });

  const allowed = [];
  const skipped = [];
  for (const t of targets) {
    let reason = null;
    if (t.id === session.id) reason = "You can't remove your own account while signed in.";
    else if (t.role === "ADMIN" || t.role === "SUPER_ADMIN") reason = "Admin accounts are removed one at a time.";
    else if (session.role === "MANAGER" && !["GUEST", "STAFF"].includes(t.role))
      reason = "Managers can only remove guest or staff accounts.";
    else if (session.role === "MANAGER" && t.buildingId !== session.buildingId)
      reason = "You can only remove accounts in your own building.";
    if (reason) skipped.push({ id: t.id, name: t.name, reason });
    else allowed.push(t.id);
  }

  const deleted = await deleteUsersWithData(prisma, allowed);
  return json({ ok: true, deleted, skipped }, 200);
}

module.exports = { POST };
