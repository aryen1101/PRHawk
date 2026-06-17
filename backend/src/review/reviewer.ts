import { complete } from "../llm/groq.js";
import { reviewResultSchema, type ReviewResult } from "./schema.js";
import { buildReviewSystemPrompt, buildReviewUserPrompt } from "./prompts.js";
import type { ConventionRule, FileContext } from "../types.js";

export async function reviewDiff(
  prTitle: string,
  prBody: string,
  contexts: FileContext[],
  conventions: ConventionRule[],
  customLlmKey?: string,
  customLlmBase?: string,
): Promise<ReviewResult> {
  const result = await complete(
    buildReviewSystemPrompt(conventions),
    buildReviewUserPrompt(prTitle, prBody, contexts),
    reviewResultSchema,
    customLlmKey,
    customLlmBase,
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
