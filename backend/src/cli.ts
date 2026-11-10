import {
  parseUrl,
  fetchPullRequest,
  buildFileContexts,
} from "./github/prService.js";
import { postReview } from "./github/reviewPublishers.js";
import { getOctokitClient } from "./github/client.js";
import {
  getInstallationToken,
  getPublicRepositoryName,
  getRepositoryInstallationId,
} from "./github/appAuth.js";
import { reviewDiff } from "./review/reviewer.js";
import { loadConventions } from "./conventions/store.js";
import { learnConventions } from "./conventions/learner.js";
import { loadReviewConventions, repositoryScope } from "./conventions/scopes.js";
import { config } from "./config.js";

/**
 * How the CLI reaches a repository and where its rules live. This mirrors the
 * webhook so `review --dry-run` uses the same rules a real review would:
 * - App installed on the repo  → installation token, github-installation:<id>:<repo>
 *                                (plus configured sources and custom rules)
 * - not installed, public repo → GITHUB_TOKEN (or anonymous), github-public:<repo>
 * - not installed, private     → GITHUB_TOKEN, github-repository:<repo>
 */
interface CliTarget {
  repository: string;
  installationId?: number;
  token?: string;
  anonymous: boolean;
  scope: string;
  description: string;
}

function parseRepo(target: string): { owner: string; repo: string } | null {
  const match =
    target.match(/github\.com\/([^/]+)\/([^/]+)/) ??
    target.match(/^([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

async function resolveTarget(owner: string, repo: string): Promise<CliTarget> {
  const name = `${owner}/${repo}`;

  if (config.githubAppId && config.githubAppPrivateKey) {
    const installationId = await getRepositoryInstallationId(name);
    if (installationId) {
      const token = await getInstallationToken(installationId);
      const { data } = await getOctokitClient(token).repos.get({ owner, repo });
      return {
        repository: data.full_name,
        installationId,
        token,
        anonymous: false,
        scope: repositoryScope(installationId, data.full_name),
        description: `GitHub App installation ${installationId}`,
      };
    }
  }

  const hasToken = Boolean(process.env.GITHUB_TOKEN);
  const publicName = await getPublicRepositoryName(name);
  if (publicName) {
    return {
      repository: publicName,
      anonymous: !hasToken,
      scope: repositoryScope(undefined, publicName, "public"),
      description: hasToken ? "public repository via GITHUB_TOKEN" : "public repository (anonymous)",
    };
  }

  if (!hasToken) {
    throw new Error(
      `PRHawk's GitHub App is not installed on ${name} and it is not public. ` +
        "Install the App on it, or set GITHUB_TOKEN to a token that can read it.",
    );
  }
  return {
    repository: name,
    anonymous: false,
    scope: repositoryScope(undefined, name),
    description: "private repository via GITHUB_TOKEN",
  };
}

function printHelp(): void {
  console.log(`PRHawk CLI

Usage:
  npm run review -- <github-pr-url> [--dry-run]
  npm run learn -- <owner/repo-or-github-url>

Examples:
  npm run review -- https://github.com/owner/repo/pull/123
  npm run review -- https://github.com/owner/repo/pull/123 --dry-run
  npm run learn -- owner/repo

Repositories with the PRHawk GitHub App installed use the App's credentials and
the same rules as webhook reviews. Others use GITHUB_TOKEN.
`);
}

async function review(url: string, dryRun: boolean): Promise<void> {
  const ref = parseUrl(url);
  const target = await resolveTarget(ref.owner, ref.repo);
  if (!dryRun && target.anonymous) {
    throw new Error("Posting a review needs GITHUB_TOKEN or the GitHub App installed on the repository. Use --dry-run to preview.");
  }
  console.log(`Fetching PR #${ref.pullNumber} from ${target.repository} (${target.description})...`);

  const { pr, files } = await fetchPullRequest(ref, target.token, target.anonymous);
  const { contexts, skipped } = await buildFileContexts(ref, pr, files, target.token, target.anonymous);
  for (const file of skipped) {
    console.log(`  skipped ${file.path}: ${file.reason}`);
  }
  if (contexts.length === 0) {
    console.log("No reviewable changes found.");
    return;
  }

  const conventions = target.installationId
    ? await loadReviewConventions(target.installationId, target.repository)
    : await loadConventions(target.scope);
  console.log(`Reviewing ${contexts.length} file(s) with ${conventions.length} convention(s) from ${target.scope}...`);

  const result = await reviewDiff(pr.title ?? "", pr.body ?? "", contexts, conventions);
  if (!dryRun) {
    await postReview(ref, pr.head.sha, result, target.token, skipped);
  }

  console.log(
    `${dryRun ? "Dry run complete" : "Done. Review posted"}. ` +
      `${result.comments.length} inline comment(s), quality score ${result.summary.qualityScore}/100, ` +
      `decision: ${result.summary.mergeDecision}.`,
  );
  if (dryRun) {
    for (const comment of result.comments) {
      console.log(`  [${comment.severity}] ${comment.path}:${comment.line} — ${comment.issue}`);
    }
  }
}

async function learn(input: string): Promise<void> {
  const parsed = parseRepo(input);
  if (!parsed) {
    throw new Error("Provide a repository as 'owner/repo' or a GitHub repository URL.");
  }

  const target = await resolveTarget(parsed.owner, parsed.repo);
  console.log(`Learning conventions from ${target.repository} (${target.description})...`);
  const rules = await learnConventions(target.scope, parsed.owner, parsed.repo, target.token, target.anonymous);
  console.log(`Learned and saved ${rules.length} convention(s) to ${target.scope}.`);
  for (const rule of rules) {
    console.log(`  - [${rule.severity}] ${rule.rule}`);
  }
}

async function main(): Promise<void> {
  const [command, target, ...options] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || target === "--help") {
    printHelp();
    return;
  }
  if (!target) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (command === "review") {
    await review(target, options.includes("--dry-run"));
  } else if (command === "learn") {
    await learn(target);
  } else {
    throw new Error(`Unknown command '${command}'. Run with --help for usage.`);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
