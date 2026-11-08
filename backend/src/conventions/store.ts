import { randomUUID } from "node:crypto";
import type { ConventionRule } from "../types.js";
import { client } from "../db/index.js";

interface ConventionsDoc {
  userId: string;
  rules: ConventionRule[];
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
  return client.db("pr_hawk").collection<ConventionsDoc>("conventions");
}

function configurationCollection() {
  return client.db("pr_hawk").collection<ConventionConfiguration>("convention_configurations");
}

function customConventionsCollection() {
  return client.db("pr_hawk").collection<CustomConventionsDoc>("custom_conventions");
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
    conventionsCollection().findOne({ userId }),
    customConventionsCollection().findOne({ scope: userId }),
  ]);
  return [...(doc?.rules ?? []), ...(custom?.rules ?? [])].filter((rule) => rule.enabled !== false);
}

export async function listConventions(userId: string): Promise<ConventionRule[]> {
  const [doc, custom] = await Promise.all([
    conventionsCollection().findOne({ userId }),
    customConventionsCollection().findOne({ scope: userId }),
  ]);
  return [...(doc?.rules ?? []), ...(custom?.rules ?? [])];
}

export async function saveCoventions(
  userId: string,
  rules: ConventionRule[],
): Promise<void> {
  const normalizedRules = rules.map((rule) => withRuleMetadata(rule, "learned"));
  await conventionsCollection().updateOne(
    { userId },
    { $set: { userId, rules: normalizedRules } },
    { upsert: true },
  );
}

export async function loadConventionConfiguration(
  installationId: number,
  repository: string,
): Promise<ConventionConfiguration | null> {
  return configurationCollection().findOne({ installationId, repository });
}

export async function saveConventionConfiguration(
  installationId: number,
  repository: string,
  conventionSources: ConventionSource[] | string[],
): Promise<void> {
  await configurationCollection().updateOne(
    { installationId, repository },
    {
      $set: {
        installationId,
        repository,
        conventionSources: normalizeSources(conventionSources),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function addCustomConvention(
  scope: string,
  rule: Omit<ConventionRule, "id" | "kind">,
): Promise<ConventionRule> {
  const customRule = withRuleMetadata(rule, "custom");
  await customConventionsCollection().updateOne(
    { scope },
    { $set: { scope }, $push: { rules: customRule } },
    { upsert: true },
  );
  return customRule;
}

export async function updateCustomConvention(
  scope: string,
  id: string,
  update: Partial<Pick<ConventionRule, "rule" | "rationale" | "severity" | "enabled">>,
): Promise<ConventionRule | null> {
  const doc = await customConventionsCollection().findOne({ scope });
  const index = doc?.rules.findIndex((rule) => rule.id === id) ?? -1;
  if (index < 0 || !doc) return null;
  const updated = { ...doc.rules[index], ...update, kind: "custom" as const };
  doc.rules[index] = updated;
  await customConventionsCollection().updateOne({ scope }, { $set: { rules: doc.rules } });
  return updated;
}

export async function deleteCustomConvention(scope: string, id: string): Promise<boolean> {
  const result = await customConventionsCollection().updateOne(
    { scope },
    { $pull: { rules: { id } } },
  );
  return result.modifiedCount > 0;
}
