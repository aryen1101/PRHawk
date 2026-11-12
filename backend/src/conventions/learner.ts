import { getOctokitClient } from "../github/client.js";
import { complete } from "../llm/groq.js";
import { config } from "../config.js";
import { acquireLock } from "../db/index.js";
import {
  getLearningState,
  listPublicSources,
  markLearnedUnchanged,
  markLearningAttempt,
  saveCoventions,
} from "./store.js";
import type { LearningState } from "./store.js";
import { repositoryScope } from "./scopes.js";
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
/**
 * How long a learning lock is held before another instance may take it over.
 * Longer than a normal run (fetching samples plus up to three model attempts).
 */
const LEARNING_LOCK_TTL_MS = 10 * 60 * 1000;

export type LearnOutcome =
  | { status: "learned"; rules: ConventionRule[] }
  | { status: "unchanged"; rules: ConventionRule[] }
  | { status: "skipped"; reason: string };

const inFlight = new Map<string, Promise<LearnOutcome>>();

/** Learns and saves a scope's rules immediately, even if nothing new has merged (used by the CLI). */
export async function learnConventions(
  userId: string,
  owner: string,
  repo: string,
  customToken?: string,
  anonymous = false,
): Promise<ConventionRule[]> {
  const outcome = await runLearning(userId, owner, repo, customToken, anonymous, null);
  return outcome.rules;
}

/**
 * Fetches the latest merged pull requests and learns rules from them. When
 * `previous` is given and the sample is the same set of pull requests the
 * saved rules came from, the model call is skipped and the rules are kept.
 */
async function runLearning(
  userId: string,
  owner: string,
  repo: string,
  customToken: string | undefined,
  anonymous: boolean,
  previous: LearningState | null,
): Promise<Extract<LearnOutcome, { rules: ConventionRule[] }>> {
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

  const sampledPullNumbers = merged.map((p) => p.number).sort((a, b) => a - b);
  if (
    previous &&
    previous.rules.length > 0 &&
    previous.sampledPullNumbers.join(",") === sampledPullNumbers.join(",")
  ) {
    await markLearnedUnchanged(userId);
    return { status: "unchanged", rules: previous.rules };
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
  return { status: "learned", rules: await saveCoventions(userId, rules, sampledPullNumbers) };
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
 * scope share one run in this process, and a MongoDB lock stops other backend
 * instances from learning the same scope at the same time.
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
    const release = await acquireLock(`learning:${scope}`, LEARNING_LOCK_TTL_MS);
    if (!release) return { status: "skipped", reason: "another instance is learning it" };
    try {
      // Checked after taking the lock, so a run another instance just finished is seen.
      const state = await getLearningState(scope);
      const reason = skipReason(state, maxAgeMs);
      if (reason) return { status: "skipped", reason };
      await markLearningAttempt(scope);
      return await runLearning(scope, owner, repo, customToken, anonymous, state);
    } finally {
      await release().catch((err) => {
        console.error(`Could not release learning lock for ${scope}:`, err instanceof Error ? err.message : err);
      });
    }
  })().finally(() => inFlight.delete(scope));

  inFlight.set(scope, run);
  return run;
}

/** How often the backend looks for public sources whose rules are older than their window. */
const SOURCE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
/** Delay before the first check after startup. */
const SOURCE_REFRESH_START_DELAY_MS = 60 * 1000;
/**
 * Full learning runs per check. Public sources are read anonymously (60 GitHub
 * requests an hour per IP) and a run uses about 11, so a few per hour leaves
 * room for setup saves and merges.
 */
const MAX_SOURCE_REFRESHES_PER_CHECK = 3;

/**
 * Refreshes public convention sources on a schedule, so their rules do not go
 * stale when no repository that uses them merges a pull request. Target
 * repositories need no schedule: their rules only change when they merge,
 * which already triggers learning. Installed sources also learn on their own
 * merges. Every instance runs this; the learning lock and the staleness check
 * keep each source to one run per window.
 */
export function startSourceRefresh(maxAgeMs: number): void {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      let fullRuns = 0;
      for (const repository of await listPublicSources()) {
        if (fullRuns >= MAX_SOURCE_REFRESHES_PER_CHECK) break;
        const [owner, repo] = repository.split("/");
        try {
          const outcome = await learnConventionsIfStale(
            repositoryScope(undefined, repository, "public"),
            owner,
            repo,
            maxAgeMs,
            undefined,
            true,
          );
          if (outcome.status === "learned") {
            fullRuns++;
            console.log(`Scheduled refresh learned ${outcome.rules.length} convention(s) for ${repository}.`);
          } else if (outcome.status === "unchanged") {
            console.log(`Scheduled refresh: no new merged pull requests in ${repository}; rules kept.`);
          }
        } catch (err) {
          fullRuns++;
          console.error(`Scheduled refresh failed for ${repository}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("Scheduled source refresh failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  setTimeout(() => {
    void check();
    setInterval(() => void check(), SOURCE_REFRESH_INTERVAL_MS).unref();
  }, SOURCE_REFRESH_START_DELAY_MS).unref();
}
