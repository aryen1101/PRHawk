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

const MAX_SAMPLE_CHARS = 5000;

export async function learnConventions(
  owner: string,
  repo: string,
  customToken?: string,
  customLlmKey?: string,
  customLlmBase?: string,
): Promise<ConventionRule[]> {
  const client = getOctokitClient(customToken);

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
    samples.push(
      `PR #${p.number}: ${p.title}\n${patches}`.slice(0, MAX_SAMPLE_CHARS),
    );
  }
  const result = await complete(
    buildConventionsSystemPrompt(),
    buildConventionsUserPrompt(samples),
    conventionsSchema,
    customLlmKey,
    customLlmBase,
  );

  const rules = result.rules ?? [];
  await saveCoventions(rules);
  return rules;
}
