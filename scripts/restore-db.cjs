#!/usr/bin/env node
/**
 * Puts a backup made by backup-db.cjs back into a database.
 *
 *   MONGO_URL=... node scripts/restore-db.cjs <backup-dir> [collection ...] --yes
 *
 * Each restored collection is first emptied, then filled from the backup, so
 * it ends up exactly as it was that night — anything added since is lost.
 * Name collections to restore only those (e.g. `products orders`); with none,
 * every collection in the backup is restored. Nothing happens without --yes.
 *
 * Safer habit: restore into a new, empty database first (a different
 * MONGO_URL), check it, and only then over the live one.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const { EJSON } = mongoose.mongo.BSON;

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const [dir, ...only] = args.filter((a) => a !== "--yes");
  const url = process.env.MONGO_URL;
  if (!url || !dir) {
    console.error("Usage: MONGO_URL=... node scripts/restore-db.cjs <backup-dir> [collection ...] --yes");
    process.exit(2);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((name) => !only.length || only.includes(name));
  if (!files.length) throw new Error("No matching collections in " + dir);

  if (!confirmed) {
    console.log("Would empty and restore:", files.join(", "));
    console.log("Run again with --yes to do it.");
    return;
  }

  const conn = await mongoose.createConnection(url).asPromise();
  try {
    for (const name of files) {
      const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"), { relaxed: false });
      const col = conn.db.collection(name);
      await col.deleteMany({});
      if (docs.length) await col.insertMany(docs, { ordered: false });
      console.log(`${name}: ${docs.length} restored`);
    }
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
