const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "ADMIN") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  }

  const { id } = params;

  if (id === session.id) {
    return new Response(JSON.stringify({ error: "You can't remove your own account while signed in." }), {
      status: 400,
    });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return new Response(JSON.stringify({ error: "Account not found." }), { status: 404 });
  }

  const vehicleCount = await prisma.vehicle.count({ where: { ownerId: id } });
  if (vehicleCount > 0) {
    return new Response(
      JSON.stringify({
        error: `Can't remove — this account has ${vehicleCount} vehicle(s) on file. Those need to be reassigned or removed first.`,
      }),
      { status: 409 }
    );
  }

  const requestCount = await prisma.request.count({ where: { requestedById: id } });
  if (requestCount > 0) {
    return new Response(
      JSON.stringify({
        error: `Can't remove — this account has ${requestCount} request(s) in its history. Removing it would break that history.`,
      }),
      { status: 409 }
    );
  }

  // Clear this user as the "handled by" staff member on any past requests —
  // that's just a historical reference, not a blocker, since requests don't
  // depend on it existing.
  await prisma.request.updateMany({
    where: { handledById: id },
    data: { handledById: null },
  });

  await prisma.user.delete({ where: { id } });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

module.exports = { DELETE };