/**
 * Finds documents that break the unique indexes created by initDb, and with
 * --fix merges each group into one document.
 *
 *   npm run db:dedupe            report only
 *   npm run db:dedupe -- --fix   merge and delete the extra copies
 *
 * Keys are compared case-insensitively, matching the index collation.
 */
import type { Document, ObjectId } from "mongodb";
import { client, COLLECTIONS, db } from "./index.js";

interface DuplicateGroup {
  key: unknown;
  docs: Document[];
}

async function findDuplicates(collection: string, groupKey: Document): Promise<DuplicateGroup[]> {
  return db()
    .collection(collection)
    .aggregate<DuplicateGroup>([
      { $group: { _id: groupKey, docs: { $push: "$$ROOT" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $project: { _id: 0, key: "$_id", docs: 1 } },
    ])
    .toArray();
}

function time(value: unknown): number {
  return value instanceof Date ? value.getTime() : 0;
}

/** Newest first by the given date fields, then by insertion order. */
function newestFirst(docs: Document[], ...fields: string[]): Document[] {
  return [...docs].sort((a, b) => {
    for (const field of fields) {
      const diff = time(b[field]) - time(a[field]);
      if (diff !== 0) return diff;
    }
    return (b._id as ObjectId).getTimestamp().getTime() - (a._id as ObjectId).getTimestamp().getTime();
  });
}

async function replaceGroup(collection: string, keep: Document, merged: Document, drop: Document[]) {
  const coll = db().collection(collection);
  await coll.deleteMany({ _id: { $in: drop.map((doc) => doc._id) } });
  await coll.replaceOne({ _id: keep._id }, merged);
}

/** Learned rules: keep the most recently learned copy. */
async function dedupeConventions(fix: boolean): Promise<number> {
  const groups = await findDuplicates(COLLECTIONS.conventions, { $toLower: "$userId" });
  for (const group of groups) {
    const [keep, ...drop] = newestFirst(group.docs, "learnedAt", "attemptedAt");
    console.log(`${COLLECTIONS.conventions}: ${group.docs.length} copies of '${keep.userId}'`);
    if (!fix) continue;
    const attemptedAt = group.docs.map((doc) => doc.attemptedAt).filter(Boolean)
      .sort((a, b) => time(b) - time(a))[0];
    await replaceGroup(COLLECTIONS.conventions, keep, { ...keep, ...(attemptedAt ? { attemptedAt } : {}) }, drop);
  }
  return groups.length;
}

/** Custom rules: keep every distinct rule from all copies; the newest copy wins on conflicts. */
async function dedupeCustomConventions(fix: boolean): Promise<number> {
  const groups = await findDuplicates(COLLECTIONS.customConventions, { $toLower: "$scope" });
  for (const group of groups) {
    const [keep, ...drop] = newestFirst(group.docs);
    console.log(`${COLLECTIONS.customConventions}: ${group.docs.length} copies of '${keep.scope}'`);
    if (!fix) continue;
    const rules = new Map<string, Document>();
    for (const doc of [keep, ...drop]) {
      for (const rule of doc.rules ?? []) {
        if (rule.id && !rules.has(rule.id)) rules.set(rule.id, rule);
      }
    }
    await replaceGroup(COLLECTIONS.customConventions, keep, { ...keep, rules: [...rules.values()] }, drop);
  }
  return groups.length;
}

/** Source configuration: keep the most recently saved copy. */
async function dedupeConfigurations(fix: boolean): Promise<number> {
  const groups = await findDuplicates(COLLECTIONS.conventionConfigurations, {
    installationId: "$installationId",
    repository: { $toLower: "$repository" },
  });
  for (const group of groups) {
    const [keep, ...drop] = newestFirst(group.docs, "updatedAt");
    console.log(
      `${COLLECTIONS.conventionConfigurations}: ${group.docs.length} copies of ` +
        `installation ${keep.installationId} '${keep.repository}'`,
    );
    if (fix) await replaceGroup(COLLECTIONS.conventionConfigurations, keep, keep, drop);
  }
  return groups.length;
}

async function main(): Promise<void> {
  const fix = process.argv.includes("--fix");
  await client.connect();
  const total =
    (await dedupeConventions(fix)) +
    (await dedupeCustomConventions(fix)) +
    (await dedupeConfigurations(fix));

  if (total === 0) console.log("No duplicates found.");
  else if (fix) console.log(`Merged ${total} duplicate group(s). The server can now create its indexes.`);
  else console.log(`Found ${total} duplicate group(s). Run again with --fix to merge them.`);
}

main()
  .then(() => client.close())
  .catch(async (err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    await client.close();
    process.exit(1);
  });
