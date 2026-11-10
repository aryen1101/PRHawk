import { getOctokitClient } from "./client.js";
import { parsePatch } from "./diffParser.js";
import { config } from "../config.js";
import { isIgnoredFile } from "../review/fileFilter.js";
import type { FileContext, PullRequestRef, SkippedFile } from "../types.js";

export interface PrInfo {
  title?: string | null;
  body?: string | null;
  head: { sha: string };
}

interface PrFile {
  filename: string;
  status?: string;
  changes?: number;
  patch?: string;
}

export function parseUrl(url: string): PullRequestRef {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) {
    throw new Error(`Not a valid Github PR url: ${url}`);
  }
  return {
    owner: m[1],
    repo: m[2],
    pullNumber: Number(m[3]),
  };
}

export async function fetchPullRequest(
  ref: PullRequestRef,
  customToken?: string,
  anonymous = false,
): Promise<{ pr: PrInfo; files: PrFile[] }> {
  const client = getOctokitClient(customToken, anonymous);
  const { data: pr } = await client.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.pullNumber,
  });
  const files = await client.paginate(client.pulls.listFiles, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.pullNumber,
    per_page: 100,
  });
  return { pr, files };
}

export interface ReviewInput {
  contexts: FileContext[];
  skipped: SkippedFile[];
}

/** Per-file cost of the fixed headings and instructions in the review prompt. */
const FILE_OVERHEAD_CHARS = 450;
/** Share of the prompt budget diffs may use; the rest is for surrounding code. */
const PATCH_BUDGET_SHARE = 0.7;

function truncatePatch(patch: string, maxChars: number): { patch: string; truncated: boolean } {
  if (patch.length <= maxChars) return { patch, truncated: false };
  const cut = patch.lastIndexOf("\n", maxChars);
  return { patch: patch.slice(0, cut > 0 ? cut : maxChars), truncated: true };
}

/**
 * Returns the lines around each changed line, prefixed with their real line
 * numbers. Overlapping windows are merged; gaps are marked with "…".
 */
export function buildExcerpt(content: string, addedLines: number[], contextLines: number): string {
  const lines = content.split("\n");
  const ranges: [number, number][] = [];
  for (const line of [...addedLines].sort((a, b) => a - b)) {
    if (line < 1 || line > lines.length) continue;
    const start = Math.max(1, line - contextLines);
    const end = Math.min(lines.length, line + contextLines);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  if (ranges.length === 0) return "";

  const blocks = ranges.map(([start, end]) =>
    lines.slice(start - 1, end).map((text, i) => `${start + i}\t${text}`).join("\n"),
  );
  let excerpt = blocks.join("\n…\n");
  if (ranges[0][0] > 1) excerpt = `…\n${excerpt}`;
  if (ranges[ranges.length - 1][1] < lines.length) excerpt += "\n…";
  return excerpt;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchFileContent(
  client: ReturnType<typeof getOctokitClient>,
  ref: PullRequestRef,
  path: string,
  sha: string,
): Promise<string> {
  try {
    const { data } = await client.repos.getContent({ owner: ref.owner, repo: ref.repo, path, ref: sha });
    if (!Array.isArray(data) && data.type === "file" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
  } catch {
    // Missing or inaccessible content: review the diff only.
  }
  return "";
}

/**
 * Selects the changed files to review within the prompt budget. Smaller diffs
 * are kept first; every file left out or cut short is reported in `skipped`.
 */
export async function buildFileContexts(
  ref: PullRequestRef,
  pr: PrInfo,
  files: PrFile[],
  customToken?: string,
  anonymous = false,
): Promise<ReviewInput> {
  const { maxPromptChars, maxPatchCharsPerFile, contextLines, fileFetchConcurrency } = config.review;
  const skipped: SkippedFile[] = [];
  const candidates: Omit<FileContext, "excerpt">[] = [];

  for (const f of files) {
    if (f.status === "removed") continue;
    if (isIgnoredFile(f.filename)) {
      skipped.push({ path: f.filename, reason: "generated, vendored, or lock file" });
      continue;
    }
    if (!f.patch) {
      if (f.changes) skipped.push({ path: f.filename, reason: "GitHub provided no diff (binary or too large)" });
      continue;
    }

    const { patch, truncated } = truncatePatch(f.patch, maxPatchCharsPerFile);
    const parsed = parsePatch(f.filename, patch);
    if (parsed.addedLines.length === 0) continue;
    if (truncated) skipped.push({ path: f.filename, reason: "diff too large; only the first part was reviewed" });
    candidates.push({
      path: f.filename,
      patch: truncated ? `${patch}\n... [diff truncated]` : patch,
      addedLines: parsed.addedLines,
    });
  }

  candidates.sort((a, b) => a.patch.length - b.patch.length);
  const patchBudget = Math.floor(maxPromptChars * PATCH_BUDGET_SHARE);
  let used = 0;
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    const cost =
      candidate.patch.length +
      candidate.path.length +
      candidate.addedLines.join(", ").length +
      FILE_OVERHEAD_CHARS;
    if (used + cost > patchBudget) {
      skipped.push({ path: candidate.path, reason: "review size limit" });
      continue;
    }
    used += cost;
    selected.push(candidate);
  }

  const client = getOctokitClient(customToken, anonymous);
  const contents = await mapWithConcurrency(selected, fileFetchConcurrency, (candidate) =>
    fetchFileContent(client, ref, candidate.path, pr.head.sha),
  );

  const contexts = selected.map((candidate, index): FileContext => {
    const excerpt = contents[index] ? buildExcerpt(contents[index], candidate.addedLines, contextLines) : "";
    if (excerpt && used + excerpt.length <= maxPromptChars) {
      used += excerpt.length;
      return { ...candidate, excerpt };
    }
    return { ...candidate, excerpt: "" };
  });

  return { contexts, skipped };
}
