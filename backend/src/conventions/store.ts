import type { ConventionRule } from "../types.js";
import { client } from "../db/index.js";

interface ConventionsDoc {
  userId: string;
  rules: ConventionRule[];
}

function conventionsCollection() {
  return client.db("pr_hawk").collection<ConventionsDoc>("conventions");
}

export async function loadConventions(userId: string): Promise<ConventionRule[]> {
  const doc = await conventionsCollection().findOne({ userId });
  return doc?.rules ?? [];
}

export async function saveCoventions(
  userId: string,
  rules: ConventionRule[],
): Promise<void> {
  await conventionsCollection().updateOne(
    { userId },
    { $set: { userId, rules } },
    { upsert: true },
  );
}
