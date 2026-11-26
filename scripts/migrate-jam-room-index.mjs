import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import mongoose from "mongoose";
import JamRoom from "../src/models/JamRoom.js";

const LEGACY_NAME = "hostId_1_nameKey_1";
const REPLACEMENT_NAME = "jam_named_room_host_name_unique";
const [key, options] = JamRoom.schema.indexes().find(([, value]) => value.name === REPLACEMENT_NAME);
const metadataKeys = new Set(["v", "ns", "name", "key", "background", "unique", "sparse", "partialFilterExpression"]);
const sameKey = value => JSON.stringify(Object.entries(value || {})) === JSON.stringify(Object.entries(key));
const blocked = message => Object.assign(new Error(message), { code: "JAM_INDEX_MIGRATION_BLOCKED" });

function matches(index, legacy) {
  return sameKey(index.key)
    && index.unique === true
    && (legacy ? index.sparse === true && index.partialFilterExpression === undefined
      : index.sparse !== true && isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression))
    && Object.keys(index).every(name => metadataKeys.has(name));
}

async function indexes(collection) {
  try { return await collection.listIndexes({ maxTimeMS: 15_000 }).toArray(); }
  catch (error) { if (error.code === 26) return []; throw error; }
}

function inspect(values) {
  for (const index of values) {
    if (index.name === LEGACY_NAME) {
      if (!matches(index, true)) throw blocked("The legacy Jam index has an unexpected definition; no index was removed.");
    } else if (index.name === REPLACEMENT_NAME) {
      if (!matches(index, false)) throw blocked("The replacement Jam index has an unexpected definition; no index was removed.");
    } else if (Object.hasOwn(index.key || {}, "hostId") && Object.hasOwn(index.key || {}, "nameKey")) {
      throw blocked("Another host/name Jam index exists; review its definition before migrating.");
    }
  }
  return {
    legacy: values.some(index => index.name === LEGACY_NAME),
    replacement: values.some(index => index.name === REPLACEMENT_NAME),
  };
}

/** Index-only migration; callers must serialize it with other index administration. */
export async function migrateJamRoomIndex(db, { apply = false } = {}) {
  if (typeof apply !== "boolean") throw blocked("The migration apply option must be an explicit boolean.");
  const collection = db.collection("jamRooms");
  const before = inspect(await indexes(collection));
  const duplicates = await collection.aggregate([
    { $match: options.partialFilterExpression },
    { $group: { _id: { hostId: "$hostId", nameKey: "$nameKey" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
    { $count: "groups" },
  ], { maxTimeMS: 15_000, allowDiskUse: false }).toArray();
  if (duplicates.length) throw blocked("Duplicate named Jam rooms exist; resolve them explicitly before changing indexes.");
  const result = {
    mode: apply ? "apply" : "dry-run", collection: "jamRooms",
    create: before.replacement ? [] : [REPLACEMENT_NAME],
    drop: before.legacy ? [LEGACY_NAME] : [],
  };
  if (!apply) return result;

  if (!before.replacement) {
    try { await collection.createIndex(key, { ...options, maxTimeMS: 120_000 }); }
    catch { throw blocked("The replacement index could not be built; the legacy index has not been removed."); }
  }
  const protectedState = inspect(await indexes(collection));
  if (!protectedState.replacement) throw blocked("The replacement index was not verified; the legacy index has not been removed.");
  if (protectedState.legacy) {
    try { await collection.dropIndex(LEGACY_NAME, { maxTimeMS: 120_000 }); }
    catch (error) { if (error.code !== 27) throw blocked("The replacement index is verified, but removing the legacy index failed; rerun after inspection."); }
  }
  const after = inspect(await indexes(collection));
  if (!after.replacement || after.legacy) throw blocked("The final index state was not verified; inspect the database before retrying.");
  return { ...result, verified: true };
}

function help() {
  console.log([
    "Repair the saved Jam named-room index (dry-run by default).",
    "",
    "Usage: node scripts/migrate-jam-room-index.mjs --database DATABASE [--apply]",
    "Set JAM_INDEX_MIGRATION_URI explicitly. MONGODB_URI is never used.",
    "Example for an isolated local test:",
    "  JAM_INDEX_MIGRATION_URI=mongodb://127.0.0.1:27017 node scripts/migrate-jam-room-index.mjs --database haykasa_qa",
    "",
    "Deploy the corrected Jam schema before applying, and stop older app versions",
    "from recreating the legacy index. Serialize this command with other index",
    "administration. Review the dry-run plan before passing --apply.",
    "The replacement is created and verified before the exact legacy index is",
    "removed. Room data, unrelated indexes and TTL/code uniqueness are preserved.",
    "Unexpected index definitions and duplicate named rooms require manual review.",
  ].join("\n"));
}

async function main(args) {
  if (args.includes("--help") || args.includes("-h")) { help(); return; }
  let database, apply = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--apply") apply = true;
    else if (args[index] === "--database" && !database) database = args[++index];
    else throw blocked("Unknown arguments. Use --help before running the migration.");
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(database || "") || ["admin", "config", "local"].includes(database)) {
    throw blocked("Provide an explicit application --database name; system databases are not allowed.");
  }
  const uri = process.env.JAM_INDEX_MIGRATION_URI;
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri || "")) throw blocked("Set JAM_INDEX_MIGRATION_URI explicitly; the configured application MONGODB_URI is not used.");
  const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await migrateJamRoomIndex(client.db(database), { apply }), null, 2));
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.code === "JAM_INDEX_MIGRATION_BLOCKED" ? error.message
      : "Jam index migration failed. Connection details and record contents are not printed; inspect connectivity and permissions before retrying.");
    process.exitCode = 1;
  });
}
