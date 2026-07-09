const prisma = require("../../../../../lib/db");
const { getSessionFromRequest } = require("../../../../../lib/auth");

async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Super Admin access required." }), { status: 403 });
  }

  const { id } = params;
  const body = await req.json();
  const { name, address, logoUrl } = body || {};

  const building = await prisma.building.findUnique({ where: { id } });
  if (!building) {
    return new Response(JSON.stringify({ error: "Garage not found." }), { status: 404 });
  }

  const data = {};
  if (name !== undefined && name.trim()) data.name = name.trim();
  if (address !== undefined) data.address = address || null;
  if (logoUrl !== undefined) data.logoUrl = logoUrl || null;

  const updated = await prisma.building.update({ where: { id }, data });
  return new Response(JSON.stringify(updated), { status: 200 });
}

module.exports = { PATCH };
