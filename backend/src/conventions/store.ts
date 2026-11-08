import type { ConventionRule } from "../types.js";
import { client } from "../db/index.js";

interface ConventionsDoc {
  userId: string;
  rules: ConventionRule[];
}

export interface ConventionConfiguration {
  installationId: number;
  repository: string;
  conventionSources: string[];
  updatedAt: Date;
}

function conventionsCollection() {
  return client.db("pr_hawk").collection<ConventionsDoc>("conventions");
}

function configurationCollection() {
  return client.db("pr_hawk").collection<ConventionConfiguration>("convention_configurations");
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

export async function loadConventionConfiguration(
  installationId: number,
  repository: string,
): Promise<ConventionConfiguration | null> {
  return configurationCollection().findOne({ installationId, repository });
}

export async function saveConventionConfiguration(
  installationId: number,
  repository: string,
  conventionSources: string[],
): Promise<void> {
  await configurationCollection().updateOne(
    { installationId, repository },
    {
      $set: {
        installationId,
        repository,
        conventionSources,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}
