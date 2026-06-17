import { getOctokitClient } from "./client.js";
import { parsePatch } from "./diffParser.js";
import { config } from "../config.js";
import type { FileContext, PullRequestRef } from "../types.js";

export interface PrInfo {
  title?: string | null;
  body?: string | null;
  head: { sha: string };
}

interface PrFile {
  filename: string;
  status?: string;
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
): Promise<{ pr: PrInfo; files: PrFile[] }> {
  const client = getOctokitClient(customToken);
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

export async function buildFileContexts(
  ref: PullRequestRef,
  pr: PrInfo,
  files: PrFile[],
  customToken?: string,
): Promise<FileContext[]> {
  const client = getOctokitClient(customToken);
  const contexts: FileContext[] = [];

  for (const f of files) {
    if (f.status === "removed") continue;
    const parsed = parsePatch(f.filename, f.patch);
    if (parsed.addedLines.length === 0) continue;

    let content = "";
    try {
      const { data } = await client.repos.getContent({
        owner: ref.owner,
        repo: ref.repo,
        path: f.filename,
        ref: pr.head.sha,
      });

      if (!Array.isArray(data) && data.type === "file" && data.content) {
        content = Buffer.from(data.content, "base64").toString("utf-8");

        if (content.length > config.maxFilesContextChars) {
          content =
            content.slice(0, config.maxFilesContextChars) + "\n... [truncated]";
        }
      }
    } catch {
      content = "";
    }

    contexts.push({
      path: f.filename,
      patch: parsed.patch,
      addedLines: parsed.addedLines,
      content,
    });
  }

  return contexts;
}
