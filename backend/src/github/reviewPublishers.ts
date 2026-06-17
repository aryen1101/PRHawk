import { getOctokitClient } from "./client.js";
import type { PullRequestRef, Severity } from "../types.js";
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
): Promise<void> {
  const client = getOctokitClient(customToken);

  const comments = result.comments.map((c) => ({
    path: c.path,
    line: c.line,
    side: "RIGHT" as const, // new version of the file
    body: formatCommentBody(c),
  }));

  await client.pulls.createReview({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.pullNumber,
    commit_id: headSha,
    body: formatSummaryBody(result.summary),
    event: "COMMENT",
    comments,
  });
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

function formatSummaryBody(s: RiskSummary): string {
  return [
    "## 🔍 Code Review Copilot — Risk Summary",
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
    "",
    "_Severity tags: 🐞 bug · 🔒 security · ⚡ performance · 🎨 style · 💡 suggestion_",
  ].join("\n");
}
