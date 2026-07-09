const { put } = require("@vercel/blob");
const { getSessionFromRequest } = require("../../../../lib/auth");

// Separate from the existing vehicle-photo upload route — same underlying
// storage (Vercel Blob), but its own access check (Super Admin only) and
// its own blob path prefix so garage logos and vehicle photos don't mix.
async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Super Admin access required." }), { status: 403 });
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

  try {
    const blob = await put(`garage-logos/${Date.now()}.${ext}`, buffer, {
      access: "public",
      contentType: mimeType,
    });
    return new Response(JSON.stringify({ url: blob.url }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Upload failed. Try again." }), { status: 500 });
  }
}

module.exports = { POST };
