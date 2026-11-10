import { complete } from "../llm/groq.js";
import { config } from "../config.js";
import { reviewResultSchema, type ReviewResult } from "./schema.js";
import { buildReviewSystemPrompt, buildReviewUserPrompt } from "./prompts.js";
import type { ConventionRule, FileContext, Severity } from "../types.js";

const SEVERITY_PRIORITY: Record<Severity, number> = {
  security: 0,
  bug: 1,
  performance: 2,
  style: 3,
  suggestion: 4,
};

/**
 * Keeps at most `max` conventions: custom rules first, then by severity.
 * The original order is preserved within each group.
 */
export function selectConventions(conventions: ConventionRule[], max: number): ConventionRule[] {
  return conventions
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) =>
      Number(a.rule.kind !== "custom") - Number(b.rule.kind !== "custom") ||
      SEVERITY_PRIORITY[a.rule.severity] - SEVERITY_PRIORITY[b.rule.severity] ||
      a.index - b.index,
    )
    .slice(0, max)
    .map(({ rule }) => rule);
}

export async function reviewDiff(
  prTitle: string,
  prBody: string,
  contexts: FileContext[],
  conventions: ConventionRule[],
): Promise<ReviewResult> {
  const selected = selectConventions(conventions, config.review.maxConventions);
  if (selected.length < conventions.length) {
    console.log(`Using ${selected.length} of ${conventions.length} convention rules (review limit).`);
  }

  const result = await complete(
    buildReviewSystemPrompt(selected),
    buildReviewUserPrompt(prTitle, prBody, contexts),
    reviewResultSchema,
  );

  return cleanResult(result, contexts);
}

function cleanResult(
  result: ReviewResult,
  contexts: FileContext[],
): ReviewResult {
  const addable = new Map<string, Set<number>>();
  for (const c of contexts) {
    addable.set(c.path, new Set(c.addedLines));
  }

  const comments = result.comments.filter((c) =>
    addable.get(c.path)?.has(c.line),
  );

  const qualityScore = Math.max(
    0,
    Math.min(100, Math.round(result.summary.qualityScore)),
  );

  return { summary: { ...result.summary, qualityScore }, comments };
}
