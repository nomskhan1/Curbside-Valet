const { put } = require("@vercel/blob");
const { getSessionFromRequest } = require("../../../lib/auth");

// Accepts a base64 data URL (already resized/compressed client-side) and
// uploads it to Vercel Blob storage. Returns the public URL to save on the
// vehicle record.
async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });

  // Only roles that can create/manage vehicles need to upload photos.
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    return new Response(JSON.stringify({ error: "Not allowed." }), { status: 403 });
  }

  const body = await req.json();
  const { imageBase64 } = body || {};

  if (!imageBase64 || !imageBase64.startsWith("data:image/")) {
    return new Response(JSON.stringify({ error: "A valid image is required." }), { status: 400 });
  }

  // Reject anything absurdly large even after client-side compression —
  // protects against abuse and keeps Blob storage costs sane.
  const approxBytes = imageBase64.length * 0.75;
  if (approxBytes > 4 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "Image is too large. Please use a smaller photo." }), {
      status: 400,
    });
  }

  const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    return new Response(JSON.stringify({ error: "Couldn't read that image." }), { status: 400 });
  }
  const extension = matches[1] === "jpeg" ? "jpg" : matches[1];
  const buffer = Buffer.from(matches[2], "base64");

  try {
    const blob = await put(`vehicle-photos/${Date.now()}-${session.id}.${extension}`, buffer, {
      access: "public",
      contentType: `image/${matches[1]}`,
    });
    return new Response(JSON.stringify({ url: blob.url }), { status: 200 });
  } catch (err) {
    console.error("Photo upload failed:", err);
    return new Response(JSON.stringify({ error: "Upload failed. Please try again." }), {
      status: 500,
    });
  }
}

module.exports = { POST };
