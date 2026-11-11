#!/usr/bin/env node
/**
 * Copies the whole shop database into a folder: one file per collection, in
 * Extended JSON so ids, dates and numbers come back exactly as they were
 * (see restore-db.cjs). Read-only — it never changes the database.
 *
 *   MONGO_URL=... node scripts/backup-db.cjs <out-dir>
 *
 * Run every night by .github/workflows/backup.yml.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const { EJSON } = mongoose.mongo.BSON;

async function main() {
  const url = process.env.MONGO_URL;
  const outDir = process.argv[2];
  if (!url || !outDir) {
    console.error("Usage: MONGO_URL=... node scripts/backup-db.cjs <out-dir>");
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const conn = await mongoose.createConnection(url).asPromise();
  try {
    const db = conn.db;
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith("system."))
      .sort();

    const summary = { database: db.databaseName, takenAt: new Date().toISOString(), collections: {} };
    for (const name of collections) {
      const file = fs.createWriteStream(path.join(outDir, `${name}.json`));
      let count = 0;
      file.write("[\n");
      for await (const doc of db.collection(name).find({})) {
        file.write((count ? ",\n" : "") + EJSON.stringify(doc, { relaxed: false }));
        count++;
      }
      file.write("\n]\n");
      await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())));
      summary.collections[name] = count;
      console.log(`${name}: ${count}`);
    }
    fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error("Backup failed:", err.message);
  process.exit(1);
});
