import { join } from "node:path";
import type { ConventionRule, FileContext } from "../types.js";

function numberLines(content: string): string {
  return (
    content.split("\n").map((line, i) => `${i + 1}\t${line}`),
    join("\n")
  );
}

const SEVERITY_DEFINITIONS = `Severity taxonomy (tag every comment with exactly one):
- bug: a defect that produces incorrect behaviour, a crash, or a test failure.
- security: a vulnerability or unsafe handling of input, secrets, or permissions.
- performance: a change that meaningfully degrades runtime, memory, or scalability.
- style: a readability, naming, formatting, or convention issue with no behavioural impact.
- suggestion: an optional improvement that would make the code better but is not required.`;

export function buildReviewSystemPrompt(conventions: ConventionRule[]): string {
  const conventionsBlock =
    conventions.length > 0
      ? `Team conventions learned from this repository's merged PRs — apply these as additional review rules:\n${conventions
          .map((c, i) => `${i + 1}. [${c.severity}] ${c.rule} (${c.rationale})`)
          .join("\n")}`
      : "No learned team conventions are available yet. Review against general best practices.";

  return [
    "You are Code Review Copilot, a senior software engineer reviewing a GitHub pull request.",
    "Your job is to catch mechanical review issues (bugs, security, performance, style) so human reviewers can focus on architecture, and to teach junior developers as you review.",
    "",
    SEVERITY_DEFINITIONS,
    "",
    "Rules for inline comments:",
    "- Only comment on lines listed as addable for each file. Never invent a line number.",
    "- The `line` field MUST be the line number printed at the start of the exact line of code your comment is about — read it directly off the numbered file content; do not count or estimate.",
    "- Use the full file content provided to understand context beyond the changed lines (imports, class definitions, dependencies).",
    "- Each comment must contain three parts: the issue, why it matters in production (plain English a junior can follow without research), and a concrete suggested fix.",
    "- Be precise and avoid noise: do not comment on lines that are fine. Prefer a few high-value comments over many trivial ones.",
    "",
    "Also produce a risk summary: an overall quality score (0-100), the highest-risk changes, and a recommended merge decision with rationale.",
    "",
    conventionsBlock,
  ].join("\n");
}

export function buildReviewUserPrompt(
  prTitle: string,
  prBody: string,
  contexts: FileContext[],
): string {
  const fileBlocks = contexts
    .map((c) => {
      return [
        `### File: ${c.path}`,
        `Addable line numbers (you may ONLY comment on these): ${c.addedLines.join(", ")}`,
        "",
        "Unified diff:",
        "```diff",
        c.patch,
        "```",
        "",
        "Full file content at PR head. Each line is prefixed with its line number.",
        "Set a comment's `line` to the exact number printed at the start of the line",
        "your comment is about (and it must be one of the addable line numbers above).",
        "```",
        c.content ? numberLines(c.content) : "[content unavailable]",
        "```",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Pull request title: ${prTitle || "(none)"}`,
    `Pull request description: ${prBody || "(none)"}`,
    "",
    "Review the following changed files.",
    "",
    fileBlocks,
  ].join("\n");
}

export function buildConventionsSystemPrompt(): string {
  return [
    "You are analysing a repository's recently merged pull requests to extract the team's coding conventions.",
    "Identify concrete, actionable review rules that recur across these accepted changes — for example naming patterns, error-handling style, import organisation, testing expectations, or required documentation.",
    "Return only rules supported by evidence in the diffs. Each rule must be specific enough to apply automatically during review.",
    "Aim for at least 3 high-quality rules. Tag each with the severity that best fits a future violation.",
    "",
    SEVERITY_DEFINITIONS,
  ].join("\n");
}

export function buildConventionsUserPrompt(samples: string[]): string {
  return [
    "Here are samples from recently merged pull requests (title and diffs):",
    "",
    samples.map((s, i) => `## Sample ${i + 1}\n${s}`).join("\n\n"),
    "",
    "Extract the team's conventions as review rules.",
  ].join("\n");
}
