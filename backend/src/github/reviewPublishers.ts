import { getOctokitClient } from "./client.js";
import type { PullRequestRef, Severity, SkippedFile } from "../types.js";
import type {
  InlineComment,
  ReviewResult,
  RiskSummary,
} from "../review/schema.js";

const SEVERITY_EMOJI: Record<Severity, string> = {
  bug: "🐞",
  security: "🔒",
  performance: "⚡",
  style: "🎨",
  suggestion: "💡",
};

const DECISION_LABEL: Record<RiskSummary["mergeDecision"], string> = {
  approve: "✅ Approve",
  request_changes: "🔴 Request changes",
  comment: "💬 Comment",
};

export async function postReview(
  ref: PullRequestRef,
  headSha: string,
  result: ReviewResult,
  customToken?: string,
  skipped: SkippedFile[] = [],
): Promise<void> {
  const client = getOctokitClient(customToken);

  const comments = result.comments.map((c) => ({
    path: c.path,
    line: c.line,
    side: "RIGHT" as const, // new version of the file
    body: formatCommentBody(c),
  }));

  try {
    await client.pulls.createReview({
      owner: ref.owner,
      repo: ref.repo,
      pull_number: ref.pullNumber,
      commit_id: headSha,
      body: formatSummaryBody(result.summary, skipped),
      event: "COMMENT",
      comments,
    });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const repo = `${ref.owner}/${ref.repo}`;
    if (status === 401) {
      throw new Error(
        "GitHub rejected the installation token (HTTP 401). Reinstall the GitHub App and verify its repository permissions.",
      );
    }
    if (status === 403 || status === 404) {
      throw new Error(
        `GitHub rejected the review (HTTP ${status}). The GitHub token must have permission to post pull request reviews on ${repo} — ` +
          `use a classic token with the 'repo' scope (or 'public_repo' for public repos), and make sure that account has access to the repository.`,
      );
    }
    if (status === 422) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `GitHub could not post the inline review comments (HTTP 422). This usually means a suggested comment line falls outside the PR diff. ${detail}`,
      );
    }
    throw err;
  }
}

function formatCommentBody(c: InlineComment): string {
  return [
    `**${SEVERITY_EMOJI[c.severity]} ${c.severity.toUpperCase()}**`,
    "",
    `**Issue:** ${c.issue}`,
    `**Why it matters:** ${c.whyItMatters}`,
    `**Suggested fix:** ${c.suggestedFix}`,
  ].join("\n");
}

/** Posts a short PR comment explaining that the automated review failed. */
export async function postReviewFailure(
  ref: PullRequestRef,
  headSha: string,
  reason: string,
  customToken?: string,
): Promise<void> {
  const client = getOctokitClient(customToken);
  await client.issues.createComment({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: ref.pullNumber,
    body: [
      `## ⚠️ PRHawk couldn't review this pull request`,
      "",
      `The automated review of commit \`${headSha.slice(0, 7)}\` did not complete: ${reason}`,
      "",
      "Push a new commit to retry. If this keeps happening, ask the repository maintainer to check the PRHawk server logs.",
    ].join("\n"),
  });
}

const MAX_SKIPPED_LISTED = 20;

function formatSkipped(skipped: SkippedFile[]): string[] {
  if (skipped.length === 0) return [];
  const listed = skipped.slice(0, MAX_SKIPPED_LISTED).map((f) => `- \`${f.path}\` — ${f.reason}`);
  const more = skipped.length > MAX_SKIPPED_LISTED ? [`- …and ${skipped.length - MAX_SKIPPED_LISTED} more`] : [];
  return ["", `**Not fully reviewed (${skipped.length} file${skipped.length === 1 ? "" : "s"}):**`, ...listed, ...more];
}

function formatSummaryBody(s: RiskSummary, skipped: SkippedFile[]): string {
  return [
    "## 🔍 PRHawk — Risk Summary",
    "",
    `**Quality score:** ${s.qualityScore}/100`,
    `**Recommended decision:** ${DECISION_LABEL[s.mergeDecision]}`,
    "",
    "**Highest-risk changes:**",
    ...(s.highestRiskChanges.length
      ? s.highestRiskChanges.map((r) => `- ${r}`)
      : ["- None identified"]),
    "",
    `**Rationale:** ${s.rationale}`,
    ...formatSkipped(skipped),
    "",
    "_Severity tags: 🐞 bug · 🔒 security · ⚡ performance · 🎨 style · 💡 suggestion_",
  ].join("\n");
}
