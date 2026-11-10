import { getOctokitClient } from "../github/client.js";
import { complete } from "../llm/groq.js";
import { config } from "../config.js";
import { getLearningState, markLearningAttempt, saveCoventions } from "./store.js";
import type { LearningState } from "./store.js";
import { conventionsSchema } from "../review/schema.js";
import type { ConventionRule } from "../types.js";
import {
  buildConventionsSystemPrompt,
  buildConventionsUserPrompt,
} from "../review/prompts.js";

const MAX_SAMPLE_CHARS_PER_PR = 2500;
const MAX_TOTAL_SAMPLE_CHARS = 12000;
/** After a failed or empty run, wait at least this long before retrying a scope. */
const RETRY_BACKOFF_MS = 60 * 60 * 1000;

export type LearnOutcome =
  | { status: "learned"; rules: ConventionRule[] }
  | { status: "skipped"; reason: string };

const inFlight = new Map<string, Promise<LearnOutcome>>();

export async function learnConventions(
  userId: string,
  owner: string,
  repo: string,
  customToken?: string,
  anonymous = false,
): Promise<ConventionRule[]> {
  const client = getOctokitClient(customToken, anonymous);

  const { data: pulls } = await client.pulls.list({
    owner,
    repo,
    state: "closed",
    per_page: 50,
    sort: "updated",
    direction: "desc",
  });

  const merged = pulls.filter((p) => p.merged_at).slice(0, config.maxMergedPr);
  if (merged.length === 0) {
    throw new Error("No merged pull requests found to learn from.");
  }

  const samples: string[] = [];
  let totalSampleChars = 0;
  for (const p of merged) {
    const files = await client.paginate(client.pulls.listFiles, {
      owner,
      repo,
      pull_number: p.number,
      per_page: 100,
    });
    const patches = files
      .filter((f) => f.patch)
      .map((f) => `--- ${f.filename} ---\n${f.patch}`)
      .join("\n\n");
    const remaining = MAX_TOTAL_SAMPLE_CHARS - totalSampleChars;
    if (remaining <= 0) break;
    const sample = `PR #${p.number}: ${p.title}\n${patches}`.slice(0, Math.min(MAX_SAMPLE_CHARS_PER_PR, remaining));
    samples.push(sample);
    totalSampleChars += sample.length;
  }
  const result = await complete(
    buildConventionsSystemPrompt(),
    buildConventionsUserPrompt(samples),
    conventionsSchema,
    3000,
  );

  const rules = result.rules ?? [];
  if (rules.length === 0) {
    throw new Error("The AI returned no convention rules; existing rules were kept.");
  }
  return saveCoventions(userId, rules);
}

function skipReason(state: LearningState, maxAgeMs: number, now = Date.now()): string | null {
  if (state.learnedAt && now - state.learnedAt.getTime() < maxAgeMs) {
    return `learned ${Math.round((now - state.learnedAt.getTime()) / 60000)} min ago`;
  }
  if (state.attemptedAt && now - state.attemptedAt.getTime() < Math.min(maxAgeMs, RETRY_BACKOFF_MS)) {
    return `last attempt ${Math.round((now - state.attemptedAt.getTime()) / 60000)} min ago`;
  }
  return null;
}

/**
 * Learns conventions for a scope unless it was learned within `maxAgeMs`
 * (or attempted within the retry backoff). Concurrent calls for the same
 * scope share one run.
 */
export function learnConventionsIfStale(
  scope: string,
  owner: string,
  repo: string,
  maxAgeMs: number,
  customToken?: string,
  anonymous = false,
): Promise<LearnOutcome> {
  const running = inFlight.get(scope);
  if (running) return running;

  const run = (async (): Promise<LearnOutcome> => {
    const reason = skipReason(await getLearningState(scope), maxAgeMs);
    if (reason) return { status: "skipped", reason };
    await markLearningAttempt(scope);
    return { status: "learned", rules: await learnConventions(scope, owner, repo, customToken, anonymous) };
  })().finally(() => inFlight.delete(scope));

  inFlight.set(scope, run);
  return run;
}
