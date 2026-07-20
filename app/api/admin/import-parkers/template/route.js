const { getSessionFromRequest } = require("../../../../../lib/auth");

async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    return new Response(JSON.stringify({ error: "Not authorized." }), { status: 403 });
  }

  const template = [
    "first_name,last_name,unit,make,model,color,license_plate,decal_number,section,location,wash_day,fuel_type",
    "John,Smith,101,Toyota,Camry,Silver,ABC1234,D101,A,Level 1 Spot 12,MONDAY,GASOLINE",
    "Jane,Doe,202,Honda,Civic,Blue,XYZ5678,D202,B,Level 2 Spot 5,WEDNESDAY,GASOLINE",
  ].join("\n");

  return new Response(template, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=monthly-parkers-template.csv",
    },
  });
}

module.exports = { GET };
