import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseUrl,
  fetchPullRequest,
  buildFileContexts,
} from "./github/prService.js";
import { postReview } from "./github/reviewPublishers.js";
import { reviewDiff } from "./review/reviewer.js";
import { loadConventions, saveCoventions } from "./conventions/store.js";
import { learnConventions } from "./conventions/learner.js";
import { config } from "./config.js";

function parseRepo(target: string): { owner: string; repo: string } | null {
  const m =
    target.match(/github\.com\/([^/]+)\/([^/]+)/) ??
    target.match(/^([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

function startServer(): void {
  const app = express();
  app.use(express.json()); 

  const dir = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(dir, "..", "..", "frontend", "dist")));
  app.get("/api/auth-required", (_req, res) => {
    res.json({ authRequired: false });
  });

  app.post("/api/review", async (req, res) => {
    try {
      const url: string = req.body?.url ?? "";
      if (!url.trim()) {
        res.status(400).json({ error: "Please paste a GitHub pull request URL." });
        return;
      }

      const customToken = req.header("x-github-token") || undefined;
      const customLlmKey = req.header("x-openrouter-key") || undefined;
      const customLlmBase = customLlmKey ? "https://openrouter.ai/api/v1" : undefined;

      const ref = parseUrl(url.trim());
      const { pr, files } = await fetchPullRequest(ref, customToken);
      const contexts = await buildFileContexts(ref, pr, files, customToken);
      if (contexts.length === 0) {
        res.json({ summary: null, comments: [], message: "No reviewable changes found in this PR." });
        return;
      }

      const conventions = await loadConventions();
      const result = await reviewDiff(pr.title ?? "", pr.body ?? "", contexts, conventions, customLlmKey, customLlmBase);
      await postReview(ref, pr.head.sha, result, customToken);

      res.json({ ...result, conventionsUsed: conventions.length, prUrl: url.trim() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/learn", async (req, res) => {
    try {
      const target: string = req.body?.repo ?? "";
      const parsed = parseRepo(target);
      if (!parsed) {
        res.status(400).json({ error: "Provide a repo as 'owner/repo' or a GitHub URL." });
        return;
      }

      const customToken = req.header("x-github-token") || undefined;
      const customLlmKey = req.header("x-openrouter-key") || undefined;
      const customLlmBase = customLlmKey ? "https://openrouter.ai/api/v1" : undefined;

      const rules = await learnConventions(parsed.owner, parsed.repo, customToken, customLlmKey, customLlmBase);
      res.json({ rules });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/conventions", async (_req, res) => {
    try {
      const rules = await loadConventions();
      res.json({ rules });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/conventions", async (req, res) => {
    try {
      const rules = req.body?.rules;
      if (!Array.isArray(rules)) {
        res.status(400).json({ error: "Provide rules as an array." });
        return;
      }
      await saveCoventions(rules);
      res.json({ success: true, rules });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Code Review Copilot running on http://localhost:${port}`);
  });
}

async function runReview(url: string): Promise<void> {
  const ref = parseUrl(url);
  console.log(`Fetching PR #${ref.pullNumber} from ${ref.owner}/${ref.repo}...`);

  const { pr, files } = await fetchPullRequest(ref);
  const contexts = await buildFileContexts(ref, pr, files);
  if (contexts.length === 0) {
    console.log("No reviewable changes found.");
    return;
  }

  const conventions = await loadConventions();
  console.log(
    `Reviewing ${contexts.length} file(s) with ${conventions.length} learned convention(s)...`,
  );

  const result = await reviewDiff(pr.title ?? "", pr.body ?? "", contexts, conventions);
  await postReview(ref, pr.head.sha, result);

  console.log(
    `Done. Posted ${result.comments.length} inline comment(s). ` +
      `Quality score: ${result.summary.qualityScore}/100. ` +
      `Recommended decision: ${result.summary.mergeDecision}.`,
  );
}

async function runLearn(target: string): Promise<void> {
  const parsed = parseRepo(target);
  if (!parsed) {
    throw new Error("Provide a repository as 'owner/repo' or a github repo URL.");
  }

  console.log(`Learning conventions from ${parsed.owner}/${parsed.repo}...`);
  const rules = await learnConventions(parsed.owner, parsed.repo);
  console.log(`Learned and saved ${rules.length} convention(s).`);
  for (const r of rules) {
    console.log(`  - [${r.severity}] ${r.rule}`);
  }
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "review" && arg) {
    await runReview(arg);
  } else if (cmd === "learn" && arg) {
    await runLearn(arg);
  } else {
    startServer();
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
