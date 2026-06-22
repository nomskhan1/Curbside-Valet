const prisma = require("../../../../lib/db");
const { getSessionFromRequest } = require("../../../../lib/auth");

const VALID_STATUSES = ["WAITING", "PULLING", "READY", "COMPLETED", "CANCELLED"];

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  const { id } = params;
  const body = await req.json();
  const { status } = body || {};

  if (!status || !VALID_STATUSES.includes(status)) {
    return new Response(JSON.stringify({ error: "Invalid status." }), { status: 400 });
  }

  const existing = await prisma.request.findUnique({
    where: { id },
    include: { vehicle: true },
  });
  if (!existing) {
    return new Response(JSON.stringify({ error: "Request not found." }), { status: 404 });
  }

  const isOwner = existing.requestedById === session.id;
  const isStaff = session.role === "STAFF" || session.role === "MANAGER" || session.role === "ADMIN";

  // Staff and managers (not admin) can only act on requests from their own building.
  if (
    (session.role === "STAFF" || session.role === "MANAGER") &&
    existing.vehicle.buildingId &&
    existing.vehicle.buildingId !== session.buildingId
  ) {
    return new Response(JSON.stringify({ error: "That request belongs to a different building." }), {
      status: 403,
    });
  }

  // Guests may only cancel their own request. Staff/admin can set any status.
  if (status === "CANCELLED") {
    if (!isOwner && !isStaff) {
      return new Response(JSON.stringify({ error: "Not allowed." }), { status: 403 });
    }
  } else if (!isStaff) {
    return new Response(JSON.stringify({ error: "Only staff can update pickup status." }), {
      status: 403,
    });
  }

  const updated = await prisma.request.update({
    where: { id },
    data: {
      status,
      handledById: isStaff ? session.id : existing.handledById,
      completedAt: status === "COMPLETED" || status === "CANCELLED" ? new Date() : null,
    },
    include: { vehicle: true },
  });

  return new Response(JSON.stringify(updated), { status: 200 });
}

module.exports = { PATCH };
