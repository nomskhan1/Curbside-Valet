// Seeds the database with one admin, one staff member, and a sample guest + vehicle.
// Run with: npm run db:seed

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const building = await prisma.building.upsert({
    where: { id: "demo-building-1" },
    update: {},
    create: {
      id: "demo-building-1",
      name: "The Meridian Tower",
      address: "100 Main St",
    },
  });

  const adminPass = await bcrypt.hash("admin123", 10);
  const staffPass = await bcrypt.hash("staff123", 10);
  const guestPass = await bcrypt.hash("guest123", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminPass,
      name: "Avery Admin",
      role: "ADMIN", // admin accounts are global, no building needed
    },
  });

  const staff = await prisma.user.upsert({
    where: { username: "staff" },
    update: { buildingId: building.id },
    create: {
      username: "staff",
      passwordHash: staffPass,
      name: "Sam Staff",
      role: "STAFF",
      buildingId: building.id,
    },
  });

  const guest = await prisma.user.upsert({
    where: { username: "guest" },
    update: { buildingId: building.id },
    create: {
      username: "guest",
      passwordHash: guestPass,
      name: "Jordan Park",
      role: "GUEST",
      buildingId: building.id,
    },
  });

  await prisma.vehicle.upsert({
    where: { ticketNumber: "042" },
    update: { buildingId: building.id },
    create: {
      make: "Audi",
      model: "Q5",
      color: "Black",
      licensePlate: "8XJ-201",
      ticketNumber: "042",
      ownerId: guest.id,
      buildingId: building.id,
    },
  });

  console.log("Seeded:");
  console.log("  Building -> " + building.name);
  console.log("  Admin -> username: admin / password: admin123 (global, all buildings)");
  console.log("  Staff -> username: staff / password: staff123 (" + building.name + ")");
  console.log("  Guest -> username: guest / password: guest123 (ticket #042, " + building.name + ")");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
