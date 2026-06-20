// Seeds the database with one admin, one staff member, and a sample guest + vehicle.
// Run with: npm run db:seed

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash("admin123", 10);
  const staffPass = await bcrypt.hash("staff123", 10);
  const guestPass = await bcrypt.hash("guest123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@curbside.app" },
    update: {},
    create: {
      email: "admin@curbside.app",
      passwordHash: adminPass,
      name: "Avery Admin",
      role: "ADMIN",
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@curbside.app" },
    update: {},
    create: {
      email: "staff@curbside.app",
      passwordHash: staffPass,
      name: "Sam Staff",
      role: "STAFF",
    },
  });

  const guest = await prisma.user.upsert({
    where: { email: "guest@curbside.app" },
    update: {},
    create: {
      email: "guest@curbside.app",
      passwordHash: guestPass,
      name: "Jordan Park",
      role: "GUEST",
    },
  });

  await prisma.vehicle.upsert({
    where: { ticketNumber: "042" },
    update: {},
    create: {
      make: "Audi",
      model: "Q5",
      color: "Black",
      licensePlate: "8XJ-201",
      ticketNumber: "042",
      ownerId: guest.id,
    },
  });

  console.log("Seeded:");
  console.log("  Admin -> admin@curbside.app / admin123");
  console.log("  Staff -> staff@curbside.app / staff123");
  console.log("  Guest -> guest@curbside.app / guest123 (ticket #042)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
