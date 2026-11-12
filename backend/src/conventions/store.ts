import { randomUUID } from "node:crypto";
import type { ConventionRule } from "../types.js";
import { CASE_INSENSITIVE, COLLECTIONS, db, upsertWithRetry } from "../db/index.js";

interface ConventionsDoc {
  userId: string;
  rules: ConventionRule[];
  /** Last time learning finished and saved rules. */
  learnedAt?: Date;
  /** Last time learning started, whether or not it succeeded. */
  attemptedAt?: Date;
}

export interface LearningState {
  learnedAt: Date | null;
  attemptedAt: Date | null;
}

export interface ConventionConfiguration {
  installationId: number;
  repository: string;
  conventionSources: ConventionSource[];
  updatedAt: Date;
}

export interface ConventionSource {
  repository: string;
  visibility: "installation" | "public";
}

interface CustomConventionsDoc {
  scope: string;
  rules: ConventionRule[];
}

function conventionsCollection() {
  return db().collection<ConventionsDoc>(COLLECTIONS.conventions);
}

function configurationCollection() {
  return db().collection<ConventionConfiguration>(COLLECTIONS.conventionConfigurations);
}

function customConventionsCollection() {
  return db().collection<CustomConventionsDoc>(COLLECTIONS.customConventions);
}

function withRuleMetadata(rule: ConventionRule, kind: "learned" | "custom"): ConventionRule {
  return {
    ...rule,
    id: rule.id ?? randomUUID(),
    kind,
    enabled: rule.enabled !== false,
  };
}

function normalizeSources(sources: ConventionSource[] | string[]): ConventionSource[] {
  return sources.map((source) => typeof source === "string"
    ? { repository: source, visibility: "installation" as const }
    : source);
}

export async function loadConventions(userId: string): Promise<ConventionRule[]> {
  const [doc, custom] = await Promise.all([
    conventionsCollection().findOne({ userId }, { collation: CASE_INSENSITIVE }),
    customConventionsCollection().findOne({ scope: userId }, { collation: CASE_INSENSITIVE }),
  ]);
  return [...(doc?.rules ?? []), ...(custom?.rules ?? [])].filter((rule) => rule.enabled !== false);
}

export async function listConventions(userId: string): Promise<ConventionRule[]> {
  const [doc, custom] = await Promise.all([
    conventionsCollection().findOne({ userId }, { collation: CASE_INSENSITIVE }),
    customConventionsCollection().findOne({ scope: userId }, { collation: CASE_INSENSITIVE }),
  ]);
  return [...(doc?.rules ?? []), ...(custom?.rules ?? [])];
}

function ruleKey(rule: Pick<ConventionRule, "rule">): string {
  return rule.rule.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Replaces a scope's learned rules. Rules whose text matches an existing rule
 * keep that rule's id and enabled flag, so the list stays stable across runs.
 */
export async function saveCoventions(
  userId: string,
  rules: ConventionRule[],
): Promise<ConventionRule[]> {
  const existing = await conventionsCollection().findOne({ userId }, { collation: CASE_INSENSITIVE });
  const previous = new Map((existing?.rules ?? []).map((rule) => [ruleKey(rule), rule]));
  const seen = new Set<string>();
  const normalizedRules: ConventionRule[] = [];

  for (const rule of rules) {
    const key = ruleKey(rule);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const match = previous.get(key);
    normalizedRules.push(withRuleMetadata(
      { ...rule, id: match?.id, enabled: match?.enabled },
      "learned",
    ));
  }

  await upsertWithRetry(() => conventionsCollection().updateOne(
    { userId },
    { $set: { userId, rules: normalizedRules, learnedAt: new Date() } },
    { upsert: true, collation: CASE_INSENSITIVE },
  ));
  return normalizedRules;
}

export async function getLearningState(userId: string): Promise<LearningState> {
  const doc = await conventionsCollection().findOne(
    { userId },
    { projection: { learnedAt: 1, attemptedAt: 1 }, collation: CASE_INSENSITIVE },
  );
  return { learnedAt: doc?.learnedAt ?? null, attemptedAt: doc?.attemptedAt ?? null };
}

export async function markLearningAttempt(userId: string): Promise<void> {
  await upsertWithRetry(() => conventionsCollection().updateOne(
    { userId },
    { $set: { userId, attemptedAt: new Date() }, $setOnInsert: { rules: [] } },
    { upsert: true, collation: CASE_INSENSITIVE },
  ));
}

export async function loadConventionConfiguration(
  installationId: number,
  repository: string,
): Promise<ConventionConfiguration | null> {
  return configurationCollection().findOne({ installationId, repository }, { collation: CASE_INSENSITIVE });
}

export async function saveConventionConfiguration(
  installationId: number,
  repository: string,
  conventionSources: ConventionSource[] | string[],
): Promise<void> {
  await upsertWithRetry(() => configurationCollection().updateOne(
    { installationId, repository },
    {
      $set: {
        installationId,
        repository,
        conventionSources: normalizeSources(conventionSources),
        updatedAt: new Date(),
      },
    },
    { upsert: true, collation: CASE_INSENSITIVE },
  ));
}

export async function addCustomConvention(
  scope: string,
  rule: Omit<ConventionRule, "id" | "kind">,
): Promise<ConventionRule> {
  const customRule = withRuleMetadata(rule, "custom");
  await upsertWithRetry(() => customConventionsCollection().updateOne(
    { scope },
    { $set: { scope }, $push: { rules: customRule } },
    { upsert: true, collation: CASE_INSENSITIVE },
  ));
  return customRule;
}

export async function updateCustomConvention(
  scope: string,
  id: string,
  update: Partial<Pick<ConventionRule, "rule" | "rationale" | "severity" | "enabled">>,
): Promise<ConventionRule | null> {
  // Set only the changed fields of the matching rule, in one atomic update.
  // Writing back the whole array would overwrite a concurrent edit to another rule.
  const fields: Record<string, unknown> = { "rules.$[target].kind": "custom" };
  for (const [field, value] of Object.entries(update)) {
    if (value !== undefined) fields[`rules.$[target].${field}`] = value;
  }
  const doc = await customConventionsCollection().findOneAndUpdate(
    { scope, "rules.id": id },
    { $set: fields },
    {
      arrayFilters: [{ "target.id": id }],
      collation: CASE_INSENSITIVE,
      returnDocument: "after",
      projection: { rules: { $elemMatch: { id } } },
    },
  );
  return doc?.rules[0] ?? null;
}

export async function deleteCustomConvention(scope: string, id: string): Promise<boolean> {
  const result = await customConventionsCollection().updateOne(
    { scope },
    { $pull: { rules: { id } } },
    { collation: CASE_INSENSITIVE },
  );
  return result.modifiedCount > 0;
}
