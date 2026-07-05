const prisma = require("../../../../lib/db");
const twilio = require("twilio");

// Twilio posts application/x-www-form-urlencoded, not JSON.
async function parseTwilioBody(req) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function twiml(message) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

async function POST(req) {
  const body = await parseTwilioBody(req);

  // Verify this request actually came from Twilio, not a spoofed POST.
  const signature = req.headers.get("x-twilio-signature");
  const url = process.env.TWILIO_SMS_WEBHOOK_URL; // full public URL of this endpoint
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken && url) {
    const valid = twilio.validateRequest(authToken, signature || "", url, body);
    if (!valid) {
      return new Response("Invalid signature.", { status: 403 });
    }
  }

  const incomingText = (body.Body || "").trim();
  const fromNumber = body.From || "";

  // Handle STOP/HELP first — carriers require these to always work,
  // regardless of what your Messaging Service default behavior does.
  const upper = incomingText.toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upper)) {
    return twiml("You've been unsubscribed and won't receive further texts from Integral Valet. Reply START to resubscribe.");
  }
  if (upper === "HELP") {
    return twiml("Integral Valet: reply with your ticket number to request your car. Msg & data rates may apply. Call [YOUR SUPPORT NUMBER] for help.");
  }

  // Ticket numbers are alphanumeric in your system (e.g. "042"), so pull
  // just that out in case the guest texts something like "ticket 042".
  const ticketMatch = incomingText.match(/[A-Za-z0-9-]+/);
  const ticketNumber = ticketMatch ? ticketMatch[0] : "";

  if (!ticketNumber) {
    return twiml("Sorry, we couldn't read a ticket number in that message. Please reply with just your ticket number, e.g. 042.");
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { ticketNumber } });
  if (!vehicle) {
    return twiml(`We couldn't find a ticket matching "${ticketNumber}". Please check the number on your ticket and try again.`);
  }

  const activeExisting = await prisma.request.findFirst({
    where: {
      vehicleId: vehicle.id,
      type: "PICKUP",
      status: { in: ["WAITING", "PULLING", "READY"] },
    },
  });
  if (activeExisting) {
    const statusMsg = {
      WAITING: "already been requested and is waiting in the queue",
      PULLING: "already on its way to you",
      READY: "already ready and waiting for you at the curb",
    }[activeExisting.status];
    return twiml(`Your car (ticket #${ticketNumber}) is ${statusMsg}.`);
  }

  await prisma.request.create({
    data: {
      vehicleId: vehicle.id,
      requestedById: vehicle.ownerId,
      etaMinutes: 0,
      status: "WAITING",
      type: "PICKUP",
      // Track the guest's phone number on the request itself would need a
      // schema change — see note below. For now this just creates the request.
    },
  });

  return twiml(`Got it! We're pulling your car (ticket #${ticketNumber}) now. Reply STOP to opt out.`);
}

module.exports = { POST };
