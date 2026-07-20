const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

async function DELETE(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), { status: 403 });
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

  // Managers can only remove guest/staff accounts in their own building.
  if (session.role === "MANAGER") {
    if (!["GUEST", "STAFF"].includes(target.role)) {
      return new Response(
        JSON.stringify({ error: "Managers can only remove guest or staff accounts." }),
        { status: 403 }
      );
    }
    if (target.buildingId !== session.buildingId) {
      return new Response(
        JSON.stringify({ error: "You can only remove accounts in your own building." }),
        { status: 403 }
      );
    }
  }

  // Admin can remove an account even if it owns vehicles or has request
  // history — everything tied to it is cleaned up together rather than
  // blocking the removal.

  // Clear this user as the "handled by" staff member on any past requests —
  // that's just a historical reference and doesn't need to block anything.
  await prisma.request.updateMany({
    where: { handledById: id },
    data: { handledById: null },
  });

  // Delete any requests this user made themselves (e.g. requesting a
  // visitor's car by ticket number, which isn't tied to a vehicle they own).
  await prisma.request.deleteMany({ where: { requestedById: id } });

  // Delete requests tied to vehicles this user owns, then the vehicles
  // themselves.
  const ownedVehicles = await prisma.vehicle.findMany({
    where: { ownerId: id },
    select: { id: true },
  });
  const ownedVehicleIds = ownedVehicles.map((v) => v.id);
  if (ownedVehicleIds.length > 0) {
    await prisma.request.deleteMany({ where: { vehicleId: { in: ownedVehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { ownerId: id } });
  }

  await prisma.user.delete({ where: { id } });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }

  const { id } = params;
  const body = await req.json();
  const { name, username, role, buildingId } = body || {};

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return new Response(JSON.stringify({ error: "Account not found." }), { status: 404 });
  }

  // A manager can only edit guest/staff accounts in their own building, and
  // can't change their role or move them to another building.
  if (session.role === "MANAGER") {
    if (!["GUEST", "STAFF"].includes(target.role)) {
      return new Response(
        JSON.stringify({ error: "Managers can only edit guest or staff accounts." }),
        { status: 403 }
      );
    }
    if (target.buildingId !== session.buildingId) {
      return new Response(
        JSON.stringify({ error: "You can only edit accounts in your own building." }),
        { status: 403 }
      );
    }
    if (role && role !== target.role) {
      return new Response(JSON.stringify({ error: "Managers can't change a user's role." }), {
        status: 403,
      });
    }
    if (buildingId && buildingId !== session.buildingId) {
      return new Response(
        JSON.stringify({ error: "Managers can't move accounts to a different building." }),
        { status: 403 }
      );
    }
  }

  const data = {};
  if (name) data.name = name;
  if (username && username !== target.username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return new Response(JSON.stringify({ error: "That username is already taken." }), {
        status: 409,
      });
    }
    data.username = username;
  }
  // Only admin may change role or building.
  if (session.role === "ADMIN") {
    if (role) data.role = role;
    if (buildingId !== undefined) data.buildingId = buildingId || null;
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      building: { select: { id: true, name: true } },
    },
  });

  return new Response(JSON.stringify(updated), { status: 200 });
}

module.exports = { DELETE, PATCH };
