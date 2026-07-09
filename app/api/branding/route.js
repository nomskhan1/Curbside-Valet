const { put } = require("@vercel/blob");
const prisma = require("../../../lib/db");
const { getSessionFromRequest } = require("../../../lib/auth");

// GET: returns { logoUrl, buildingName } for the current user's own
// building. Used by the header to show the right logo for whoever's
// logged in, instead of one hardcoded logo for everyone.
async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  if (!session.buildingId) {
    return new Response(JSON.stringify({ logoUrl: null, buildingName: null }), { status: 200 });
  }

  const building = await prisma.building.findUnique({
    where: { id: session.buildingId },
    select: { name: true, logoUrl: true },
  });

  return new Response(
    JSON.stringify({ logoUrl: building?.logoUrl || null, buildingName: building?.name || null }),
    { status: 200 }
  );
}

// POST { imageBase64 }: uploads and sets the logo for the current user's
// own building. Admin and Manager only, and only for their own building —
// mirrors how Integral Revenue's per-garage Branding tab works.
async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Admin or manager access required." }), {
      status: 403,
    });
  }
  if (!session.buildingId) {
    return new Response(
      JSON.stringify({ error: "Your account isn't assigned to a building yet." }),
      { status: 400 }
    );
  }

  const body = await req.json();
  const { imageBase64 } = body || {};
  if (!imageBase64) {
    return new Response(JSON.stringify({ error: "No image provided." }), { status: 400 });
  }

  const matches = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    return new Response(JSON.stringify({ error: "Invalid image data." }), { status: 400 });
  }
  const [, mimeType, base64Data] = matches;
  const buffer = Buffer.from(base64Data, "base64");
  const ext = mimeType.split("/")[1] || "png";

  let logoUrl;
  try {
    const blob = await put(`garage-logos/${session.buildingId}-${Date.now()}.${ext}`, buffer, {
      access: "public",
      contentType: mimeType,
    });
    logoUrl = blob.url;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Upload failed. Try again." }), { status: 500 });
  }

  const building = await prisma.building.update({
    where: { id: session.buildingId },
    data: { logoUrl },
  });

  return new Response(JSON.stringify({ logoUrl: building.logoUrl }), { status: 200 });
}

module.exports = { GET, POST };
