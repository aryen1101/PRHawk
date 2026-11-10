import { getOctokitClient } from "../github/client.js";
import { complete } from "../llm/groq.js";
import { config } from "../config.js";
import { saveCoventions } from "./store.js";
import { conventionsSchema } from "../review/schema.js";
import type { ConventionRule } from "../types.js";
import {
  buildConventionsSystemPrompt,
  buildConventionsUserPrompt,
} from "../review/prompts.js";

const MAX_SAMPLE_CHARS_PER_PR = 2500;
const MAX_TOTAL_SAMPLE_CHARS = 12000;

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
  await saveCoventions(userId, rules);
  return rules;
}
