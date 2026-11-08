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
import {
  loadConventionConfiguration,
  loadConventions,
  saveConventionConfiguration,
} from "./conventions/store.js";
import { learnConventions } from "./conventions/learner.js";
import { config } from "./config.js";
import type { ConventionRule } from "./types.js";
import {
  getInstallationRepositories,
  getInstallationToken,
  verifyWebhookSignature,
} from "./github/appAuth.js";

type PullRequestWebhook = {
  action?: string;
  installation?: { id?: number };
  pull_request?: {
    html_url?: string;
    title?: string | null;
    body?: string | null;
    merged?: boolean;
    head?: { sha?: string };
  };
};

async function getWebhookToken(installationId: number | undefined): Promise<string> {
  return config.githubAppId && config.githubAppPrivateKey
    ? await getInstallationToken(installationId ?? 0)
    : config.githubToken();
}

function repositoryScope(installationId: number | undefined, repository: string): string {
  return installationId
    ? `github-installation:${installationId}:${repository}`
    : `github-repository:${repository}`;
}

function parseRepositoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:https:\/\/github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

async function loadReviewConventions(
  installationId: number | undefined,
  repository: string,
): Promise<ConventionRule[]> {
  const ownScope = repositoryScope(installationId, repository);
  const ownRules = await loadConventions(ownScope);
  if (!installationId) return ownRules;

  const configuration = await loadConventionConfiguration(installationId, repository);
  const sourceRules = await Promise.all(
    (configuration?.conventionSources ?? []).map((source) =>
      loadConventions(repositoryScope(installationId, source)),
    ),
  );

  const unique = new Map<string, ConventionRule>();
  for (const rule of [...ownRules, ...sourceRules.flat()]) {
    unique.set(`${rule.severity}:${rule.rule}`, rule);
  }
  return [...unique.values()];
}

async function processPullRequestWebhook(payload: PullRequestWebhook): Promise<void> {
  const pullRequest = payload.pull_request;
  const url = pullRequest?.html_url;
  const sha = pullRequest?.head?.sha;
  if (!url || !sha) {
    throw new Error("GitHub webhook did not include a complete pull request payload.");
  }

  const ref = parseUrl(url);
  const token = await getWebhookToken(payload.installation?.id);
  const { pr, files } = await fetchPullRequest(ref, token);
  const contexts = await buildFileContexts(ref, pr, files, token);
  if (contexts.length === 0) {
    console.log(`No reviewable changes found for ${url}.`);
    return;
  }

  const conventions = await loadReviewConventions(payload.installation?.id, `${ref.owner}/${ref.repo}`);
  const result = await reviewDiff(
    pullRequest.title ?? pr.title ?? "",
    pullRequest.body ?? pr.body ?? "",
    contexts,
    conventions,
  );
  await postReview(ref, sha, result, token);
  console.log(`Webhook review posted for ${url}: ${result.comments.length} comment(s).`);
}

async function processConventionLearning(
  installationId: number | undefined,
  repository: string,
  token: string,
): Promise<void> {
  const rules = await learnConventions(
    repositoryScope(installationId, repository),
    repository.split("/")[0],
    repository.split("/")[1],
    token,
  );
  console.log(`Learned ${rules.length} convention(s) for ${repository}.`);
}

async function processMergedPullRequestWebhook(payload: PullRequestWebhook): Promise<void> {
  const url = payload.pull_request?.html_url;
  if (!url) {
    throw new Error("Merged pull request webhook did not include a pull request URL.");
  }

  const ref = parseUrl(url);
  const token = await getWebhookToken(payload.installation?.id);
  const repository = `${ref.owner}/${ref.repo}`;
  await processConventionLearning(payload.installation?.id, repository, token);

  if (payload.installation?.id) {
    const configuration = await loadConventionConfiguration(payload.installation.id, repository);
    for (const source of configuration?.conventionSources ?? []) {
      try {
        await processConventionLearning(payload.installation.id, source, token);
      } catch (err) {
        console.error(`Convention learning skipped for ${source}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ?? "https://pr-hawk.vercel.app,http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function startServer(): void {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.header("origin");
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.post("/api/github/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!verifyWebhookSignature(rawBody, req.header("x-hub-signature-256"))) {
      res.status(401).json({ error: "Invalid GitHub webhook signature." });
      return;
    }

    if (req.header("x-github-event") !== "pull_request") {
      res.sendStatus(204);
      return;
    }

    let payload: PullRequestWebhook;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as PullRequestWebhook;
    } catch {
      res.status(400).json({ error: "Invalid webhook JSON payload." });
      return;
    }

    if (payload.action === "closed" && payload.pull_request?.merged === true) {
      res.status(202).json({ accepted: true, task: "convention-learning" });
      void processMergedPullRequestWebhook(payload).catch((err) => {
        console.error("Convention learning failed:", err instanceof Error ? err.message : err);
      });
      return;
    }

    if (!["opened", "synchronize", "reopened"].includes(payload.action ?? "")) {
      res.sendStatus(204);
      return;
    }

    res.status(202).json({ accepted: true });
    void processPullRequestWebhook(payload).catch((err) => {
      console.error("GitHub webhook review failed:", err instanceof Error ? err.message : err);
    });
  });

  app.use(express.json());

  app.get("/api/github/setup", async (req, res) => {
    const installationId = Number(req.query.installation_id);
    if (!Number.isInteger(installationId) || installationId <= 0) {
      res.status(400).json({ error: "A valid installation_id is required." });
      return;
    }

    try {
      const repositories = await getInstallationRepositories(installationId);
      res.json({
        installationId,
        repositories: repositories.map((repository) => ({
          fullName: repository.full_name,
          private: repository.private,
        })),
      });
    } catch (err) {
      res.status(403).json({
        error: err instanceof Error ? err.message : "GitHub App installation could not be verified.",
      });
    }
  });

  app.post("/api/github/setup", async (req, res) => {
    const installationId = Number(req.body?.installationId);
    const repository = parseRepositoryName(req.body?.repository);
    const requestedSources: unknown[] = Array.isArray(req.body?.conventionSources)
      ? req.body.conventionSources
      : [];
    const conventionSources = [
      ...new Set(
        requestedSources
          .map((source) => parseRepositoryName(source))
          .filter((source): source is string => Boolean(source)),
      ),
    ];

    if (!Number.isInteger(installationId) || installationId <= 0 || !repository) {
      res.status(400).json({ error: "installationId and repository are required." });
      return;
    }

    try {
      const accessible = await getInstallationRepositories(installationId);
      const accessibleNames = new Set(accessible.map((item) => item.full_name.toLowerCase()));
      const missingRepositories = [repository, ...conventionSources]
        .filter((name) => !accessibleNames.has(name.toLowerCase()));

      if (missingRepositories.length > 0) {
        res.status(409).json({
          error: "PRHawk is not installed on one or more selected repositories.",
          missingRepositories,
        });
        return;
      }

      await saveConventionConfiguration(installationId, repository, conventionSources);
      const token = await getInstallationToken(installationId);
      res.status(201).json({ installationId, repository, conventionSources });

      void processConventionLearning(installationId, repository, token).catch((err) => {
        console.error(`Initial convention learning skipped for ${repository}:`, err instanceof Error ? err.message : err);
      });
      for (const source of conventionSources) {
        void processConventionLearning(installationId, source, token).catch((err) => {
          console.error(`Initial convention learning skipped for ${source}:`, err instanceof Error ? err.message : err);
        });
      }
    } catch (err) {
      res.status(403).json({
        error: err instanceof Error ? err.message : "GitHub App installation could not be verified.",
      });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, webhook: Boolean(config.githubWebhookSecret) });
  });

  const frontendDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "dist");
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Code Review Copilot running on http://localhost:${port}`);
  });
}

startServer();
