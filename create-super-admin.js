// One-time script to create the first Super Admin account.
// Run locally with: node create-super-admin.js
// Safe to delete after running once.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const username = "superadmin";
  const password = "ChangeMe123!"; // change this after first login if the app supports it
  const name = "Super Admin";

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`A user with username "${username}" already exists. Nothing created.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      username,
      passwordHash,
      role: "SUPER_ADMIN",
    },
  });

  console.log("Super Admin account created:");
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}`);
  console.log("Log in with these, then change the password if the app has that option.");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
