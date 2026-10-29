import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
if (process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is set, so the data lives in PostgreSQL. Use pg_dump or your provider's backups/branches instead; this script only snapshots the local SQLite file.",
  );
const dest = process.argv[2];
if (!dest)
  throw new Error(
    "Usage: node --import tsx scripts/backup.ts /private/backup/directory",
  );
mkdirSync(dest, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(
  process.env.DATABASE_PATH || ".data/mr-connect.sqlite",
);
const path = resolve(
  dest,
  "mr-connect-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite",
);
await backup(db, path);
db.close();
console.log("Database snapshot saved:", path);
console.log("Also back up the upload directory with matching access controls.");
