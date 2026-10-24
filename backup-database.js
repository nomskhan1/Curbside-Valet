// Saves a copy of every table in the live database to JSON files, one file
// per table, plus a summary with row counts. Only reads — nothing in the
// database is changed. Started by Backup-Everything.bat.
//
//   node backup-database.js "<folder to save into>"
const fs = require("fs");
const path = require("path");

// Prisma model name -> file name. Covers every table in prisma/schema.prisma.
const TABLES = [
  ["building", "Building"],
  ["user", "User"],
  ["adminBuilding", "AdminBuilding"],
  ["vehicle", "Vehicle"],
  ["vehicleDriver", "VehicleDriver"],
  ["washLog", "WashLog"],
  ["request", "Request"],
];
const PAGE = Number(process.env.BACKUP_PAGE_SIZE) || 2000;

async function dumpAll(prisma, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const counts = {};
  for (const [model, file] of TABLES) {
    if (!prisma[model]) continue; // table not in this version of the database yet
    const rows = [];
    let cursor = null;
    // Read in pages so a big Request table doesn't have to fit in one query.
    for (;;) {
      const page = await prisma[model].findMany({
        take: PAGE,
        orderBy: { id: "asc" },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      rows.push(...page);
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].id;
    }
    fs.writeFileSync(path.join(dest, `${file}.json`), JSON.stringify(rows, null, 2));
    counts[file] = rows.length;
    console.log(`  ${file}: ${rows.length} rows`);
  }
  const summary = [
    "Bring My Car database backup",
    `Saved: ${new Date().toString()}`,
    "",
    ...Object.entries(counts).map(([t, n]) => `${t}: ${n} rows`),
    "",
    "Contains account data (names, usernames, password hashes). Keep this folder private.",
  ].join("\r\n");
  fs.writeFileSync(path.join(dest, "summary.txt"), summary);
  return counts;
}

function readDatabaseUrl() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) throw new Error("Couldn't find the .env file in " + __dirname);
  let url = null;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) url = m[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!url || !url.startsWith("postgres")) throw new Error("DATABASE_URL in .env is missing or isn't a Postgres address.");
  return url;
}

async function main() {
  const dest = process.argv[2];
  if (!dest) throw new Error("Tell me which folder to save the backup in.");
  process.env.DATABASE_URL = readDatabaseUrl();
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    console.log("Database: " + new URL(process.env.DATABASE_URL).hostname);
    await dumpAll(prisma, dest);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Backup failed: " + e.message);
    process.exit(1);
  });
}

module.exports = { dumpAll };
