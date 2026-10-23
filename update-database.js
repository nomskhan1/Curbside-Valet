// Applies the database changes in prisma/schema.prisma to the live database
// (`prisma db push`). Schema changes go through Neon's direct connection,
// not the pooled one the website uses, so this swaps the host just for this
// run. Started by Update-Database.bat.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const envFile = path.join(__dirname, ".env");
if (!fs.existsSync(envFile)) {
  console.error("Couldn't find the .env file in " + __dirname);
  process.exit(1);
}

let url = null;
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
  if (m) url = m[1].trim().replace(/^["']|["']$/g, "");
}
if (!url || !url.startsWith("postgres")) {
  console.error("DATABASE_URL in .env is missing or isn't a Postgres address.");
  process.exit(1);
}

const direct = url.replace("-pooler.", ".");
console.log("Database: " + new URL(direct).hostname);
console.log("");

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  shell: true,
  cwd: __dirname,
  env: { ...process.env, DATABASE_URL: direct },
});
process.exit(result.status === null ? 1 : result.status);
