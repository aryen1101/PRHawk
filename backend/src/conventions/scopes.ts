import { applyRuleOverrides, loadConventionConfiguration, loadConventions } from "./store.js";
import type { ConventionSource } from "./store.js";
import type { ConventionRule } from "../types.js";

/**
 * Storage key for a repository's learned and custom rules:
 * - github-public:<owner>/<repo>                       public source, shared by all installations
 * - github-installation:<installationId>:<owner>/<repo> repository accessed through an installation
 * - github-repository:<owner>/<repo>                   private repository without an installation (CLI only)
 */
export function repositoryScope(
  installationId: number | undefined,
  repository: string,
  visibility: "installation" | "public" = "installation",
): string {
  if (visibility === "public") return `github-public:${repository}`;
  return installationId
    ? `github-installation:${installationId}:${repository}`
    : `github-repository:${repository}`;
}

export function normalizeConventionSource(source: ConventionSource | string): ConventionSource {
  return typeof source === "string"
    ? { repository: source, visibility: "installation" }
    : source;
}

/**
 * Rules used when reviewing a repository: its own enabled learned and custom
 * rules plus enabled rules from its configured sources, de-duplicated.
 * Learned rules the repository has turned off are left out.
 */
export async function loadReviewConventions(
  installationId: number | undefined,
  repository: string,
): Promise<ConventionRule[]> {
  const ownScope = repositoryScope(installationId, repository);
  const ownRules = await loadConventions(ownScope);
  if (!installationId) return ownRules;

  const configuration = await loadConventionConfiguration(installationId, repository);
  const sourceRules = await Promise.all(
    (configuration?.conventionSources ?? []).map((source) => {
      const normalized = normalizeConventionSource(source);
      return loadConventions(repositoryScope(installationId, normalized.repository, normalized.visibility));
    }),
  );

  const rules = applyRuleOverrides([...ownRules, ...sourceRules.flat()], configuration?.disabledRules)
    .filter((rule) => rule.enabled !== false);
  const unique = new Map<string, ConventionRule>();
  for (const rule of rules) {
    unique.set(`${rule.severity}:${rule.rule}`, rule);
  }
  return [...unique.values()];
}
