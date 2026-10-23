// Public sign-up is turned off: accounts are created by each building's
// management through /api/admin/users or the parker import. Leaving this
// open would let anyone create an account at any building and request cars
// by ticket number.
async function POST() {
  return new Response(
    JSON.stringify({
      error: "Accounts are created by your building's management. Please ask them for your login.",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}

module.exports = { POST };
