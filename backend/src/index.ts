import express from "express";
import { existsSync } from "node:fs";
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
  addCustomConvention,
  deleteCustomConvention,
  loadConventionConfiguration,
  loadConventions,
  listConventions,
  saveConventionConfiguration,
  updateCustomConvention,
} from "./conventions/store.js";
import type { ConventionSource } from "./conventions/store.js";
import { learnConventions } from "./conventions/learner.js";
import { config } from "./config.js";
import type { ConventionRule } from "./types.js";
import {
  getInstallationRepositories,
  getInstallationToken,
  isPublicRepository,
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

function repositoryScope(
  installationId: number | undefined,
  repository: string,
  visibility: "installation" | "public" = "installation",
): string {
  if (visibility === "public") return `github-public:${repository}`;
  return installationId
    ? `github-installation:${installationId}:${repository}`
    : `github-repository:${repository}`;
}

function parseRepositoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:https:\/\/github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function normalizeConventionSource(source: ConventionSource | string): ConventionSource {
  return typeof source === "string"
    ? { repository: source, visibility: "installation" }
    : source;
}

async function ensureInstalledRepository(installationId: number, repository: string): Promise<void> {
  const repositories = await getInstallationRepositories(installationId);
  if (!repositories.some((item) => item.full_name.toLowerCase() === repository.toLowerCase())) {
    throw new Error(`The GitHub App is not installed on ${repository}.`);
  }
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
    (configuration?.conventionSources ?? []).map((source) => {
      const normalized = normalizeConventionSource(source);
      return loadConventions(repositoryScope(installationId, normalized.repository, normalized.visibility));
    }),
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
  source: ConventionSource,
  installationToken: string,
): Promise<void> {
  const [owner, repo] = source.repository.split("/");
  const rules = await learnConventions(
    repositoryScope(installationId, source.repository, source.visibility),
    owner,
    repo,
    source.visibility === "public" ? undefined : installationToken,
    undefined,
    undefined,
    source.visibility === "public",
  );
  console.log(`Learned ${rules.length} ${source.visibility} convention(s) for ${source.repository}.`);
}

async function processMergedPullRequestWebhook(payload: PullRequestWebhook): Promise<void> {
  const url = payload.pull_request?.html_url;
  if (!url) {
    throw new Error("Merged pull request webhook did not include a pull request URL.");
  }

  const ref = parseUrl(url);
  const token = await getWebhookToken(payload.installation?.id);
  const repository = `${ref.owner}/${ref.repo}`;
  await processConventionLearning(
    payload.installation?.id,
    { repository, visibility: "installation" },
    token,
  );

  if (payload.installation?.id) {
    const configuration = await loadConventionConfiguration(payload.installation.id, repository);
    for (const rawSource of configuration?.conventionSources ?? []) {
      const source = normalizeConventionSource(rawSource);
      try {
        await processConventionLearning(payload.installation.id, source, token);
      } catch (err) {
        console.error(`Convention learning skipped for ${source.repository}:`, err instanceof Error ? err.message : err);
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
    const requestedRepository = parseRepositoryName(req.query.repository);
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
        configuration: requestedRepository
          ? await loadConventionConfiguration(installationId, requestedRepository)
          : null,
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
    const allowPublicSource = req.body?.allowPublicSource === true;

    if (!Number.isInteger(installationId) || installationId <= 0 || !repository) {
      res.status(400).json({ error: "installationId and repository are required." });
      return;
    }

    try {
      const accessible = await getInstallationRepositories(installationId);
      const accessibleNames = new Set(accessible.map((item) => item.full_name.toLowerCase()));
      const missingRepositories = !accessibleNames.has(repository.toLowerCase()) ? [repository] : [];
      const sourceConfigurations: ConventionSource[] = [];

      for (const source of conventionSources) {
        if (accessibleNames.has(source.toLowerCase())) {
          sourceConfigurations.push({ repository: source, visibility: "installation" });
          continue;
        }

        if (allowPublicSource && await isPublicRepository(source)) {
          sourceConfigurations.push({ repository: source, visibility: "public" });
          continue;
        }

        missingRepositories.push(source);
      }

      if (missingRepositories.length > 0) {
        res.status(409).json({
          error: allowPublicSource
            ? "PRHawk cannot access one or more selected repositories. They must be installed or public."
            : "PRHawk is not installed on one or more selected repositories.",
          missingRepositories,
        });
        return;
      }

      await saveConventionConfiguration(installationId, repository, sourceConfigurations);
      const token = await getInstallationToken(installationId);
      res.status(201).json({
        installationId,
        repository,
        conventionSources: sourceConfigurations,
      });

      void processConventionLearning(installationId, { repository, visibility: "installation" }, token).catch((err) => {
        console.error(`Initial convention learning skipped for ${repository}:`, err instanceof Error ? err.message : err);
      });
      for (const source of sourceConfigurations) {
        void processConventionLearning(installationId, source, token).catch((err) => {
          console.error(`Initial convention learning skipped for ${source.repository}:`, err instanceof Error ? err.message : err);
        });
      }
    } catch (err) {
      res.status(403).json({
        error: err instanceof Error ? err.message : "GitHub App installation could not be verified.",
      });
    }
  });

  app.get("/api/github/rules", async (req, res) => {
    const installationId = Number(req.query.installation_id);
    const repository = parseRepositoryName(req.query.repository);
    if (!Number.isInteger(installationId) || installationId <= 0 || !repository) {
      res.status(400).json({ error: "installation_id and repository are required." });
      return;
    }

    try {
      await ensureInstalledRepository(installationId, repository);
      const configuration = await loadConventionConfiguration(installationId, repository);
      const targetScope = repositoryScope(installationId, repository);
      const targetRules = await listConventions(targetScope);
      const sources = await Promise.all((configuration?.conventionSources ?? []).map(async (rawSource) => {
        const source = normalizeConventionSource(rawSource);
        const scope = repositoryScope(installationId, source.repository, source.visibility);
        return { ...source, scope, rules: await listConventions(scope) };
      }));

      res.json({
        repository,
        sources,
        targetRules,
        effectiveRules: await loadReviewConventions(installationId, repository),
      });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : "Could not load convention rules." });
    }
  });

  app.post("/api/github/rules", async (req, res) => {
    const installationId = Number(req.body?.installationId);
    const repository = parseRepositoryName(req.body?.repository);
    const severity = req.body?.severity;
    const rule = typeof req.body?.rule === "string" ? req.body.rule.trim() : "";
    const rationale = typeof req.body?.rationale === "string" ? req.body.rationale.trim() : "";
    if (!Number.isInteger(installationId) || installationId <= 0 || !repository || !rule || !rationale ||
      !["bug", "security", "style", "suggestion", "performance"].includes(severity)) {
      res.status(400).json({ error: "repository, rule, rationale, and a valid severity are required." });
      return;
    }

    try {
      await ensureInstalledRepository(installationId, repository);
      const created = await addCustomConvention(repositoryScope(installationId, repository), {
        rule,
        rationale,
        severity,
        enabled: true,
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : "Could not add custom rule." });
    }
  });

  app.patch("/api/github/rules", async (req, res) => {
    const installationId = Number(req.body?.installationId);
    const repository = parseRepositoryName(req.body?.repository);
    const id = typeof req.body?.id === "string" ? req.body.id : "";
    if (!Number.isInteger(installationId) || installationId <= 0 || !repository || !id) {
      res.status(400).json({ error: "installationId, repository, and rule id are required." });
      return;
    }

    try {
      await ensureInstalledRepository(installationId, repository);
      const update = {
        ...(typeof req.body?.rule === "string" ? { rule: req.body.rule.trim() } : {}),
        ...(typeof req.body?.rationale === "string" ? { rationale: req.body.rationale.trim() } : {}),
        ...(typeof req.body?.enabled === "boolean" ? { enabled: req.body.enabled } : {}),
        ...(["bug", "security", "style", "suggestion", "performance"].includes(req.body?.severity)
          ? { severity: req.body.severity }
          : {}),
      };
      const updated = await updateCustomConvention(repositoryScope(installationId, repository), id, update);
      if (!updated) {
        res.status(404).json({ error: "Custom rule not found." });
        return;
      }
      res.json(updated);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : "Could not update custom rule." });
    }
  });

  app.delete("/api/github/rules", async (req, res) => {
    const installationId = Number(req.body?.installationId);
    const repository = parseRepositoryName(req.body?.repository);
    const id = typeof req.body?.id === "string" ? req.body.id : "";
    if (!Number.isInteger(installationId) || installationId <= 0 || !repository || !id) {
      res.status(400).json({ error: "installationId, repository, and rule id are required." });
      return;
    }

    try {
      await ensureInstalledRepository(installationId, repository);
      const deleted = await deleteCustomConvention(repositoryScope(installationId, repository), id);
      if (!deleted) {
        res.status(404).json({ error: "Custom rule not found." });
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : "Could not delete custom rule." });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, webhook: Boolean(config.githubWebhookSecret) });
  });

  const frontendDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend", "dist");
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Code Review Copilot running on http://localhost:${port}`);
  });
}

startServer();
