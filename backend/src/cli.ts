import {
  parseUrl,
  fetchPullRequest,
  buildFileContexts,
} from "./github/prService.js";
import { postReview } from "./github/reviewPublishers.js";
import { reviewDiff } from "./review/reviewer.js";
import { loadConventions } from "./conventions/store.js";
import { learnConventions } from "./conventions/learner.js";

const CLI_USER_ID = "cli";

function parseRepo(target: string): { owner: string; repo: string } | null {
  const match =
    target.match(/github\.com\/([^/]+)\/([^/]+)/) ??
    target.match(/^([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
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
`);
}

async function review(url: string, dryRun: boolean): Promise<void> {
  const ref = parseUrl(url);
  console.log(`Fetching PR #${ref.pullNumber} from ${ref.owner}/${ref.repo}...`);

  const { pr, files } = await fetchPullRequest(ref);
  const contexts = await buildFileContexts(ref, pr, files);
  if (contexts.length === 0) {
    console.log("No reviewable changes found.");
    return;
  }

  const conventions = await loadConventions(CLI_USER_ID);
  console.log(`Reviewing ${contexts.length} file(s) with ${conventions.length} learned convention(s)...`);

  const result = await reviewDiff(pr.title ?? "", pr.body ?? "", contexts, conventions);
  if (!dryRun) {
    await postReview(ref, pr.head.sha, result);
  }

  console.log(
    `${dryRun ? "Dry run complete" : "Done. Review posted"}. ` +
      `${result.comments.length} inline comment(s), quality score ${result.summary.qualityScore}/100, ` +
      `decision: ${result.summary.mergeDecision}.`,
  );
}

async function learn(target: string): Promise<void> {
  const parsed = parseRepo(target);
  if (!parsed) {
    throw new Error("Provide a repository as 'owner/repo' or a GitHub repository URL.");
  }

  console.log(`Learning conventions from ${parsed.owner}/${parsed.repo}...`);
  const rules = await learnConventions(CLI_USER_ID, parsed.owner, parsed.repo);
  console.log(`Learned and saved ${rules.length} convention(s).`);
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

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
