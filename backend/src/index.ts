import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseUrl,
  fetchPullRequest,
  buildFileContexts,
} from "./github/prService.js";
import { postReview, postReviewFailure } from "./github/reviewPublishers.js";
import { reviewDiff } from "./review/reviewer.js";
import {
  addCustomConvention,
  deleteCustomConvention,
  loadConventionConfiguration,
  listConventions,
  saveConventionConfiguration,
  updateCustomConvention,
} from "./conventions/store.js";
import type { ConventionSource } from "./conventions/store.js";
import { learnConventionsIfStale } from "./conventions/learner.js";
import { loadReviewConventions, normalizeConventionSource, repositoryScope } from "./conventions/scopes.js";
import { config } from "./config.js";
import {
  getInstallationRepositories,
  getInstallationToken,
  getPublicRepositoryName,
  verifyWebhookSignature,
} from "./github/appAuth.js";
import { isAuthConfigured, registerAuthRoutes, requireInstallationAccess } from "./auth.js";

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

function parseRepositoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:https:\/\/github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Case-insensitive lookup of installation repositories by "owner/name". */
function canonicalNames(repositories: { full_name: string }[]): Map<string, string> {
  return new Map(repositories.map((item) => [item.full_name.toLowerCase(), item.full_name]));
}

/**
 * Verifies the App is installed on the repository and returns its canonical
 * "owner/name" (GitHub's casing), which is used for scopes and configuration.
 */
async function resolveInstalledRepository(installationId: number, repository: string): Promise<string> {
  const canonical = canonicalNames(await getInstallationRepositories(installationId)).get(repository.toLowerCase());
  if (!canonical) {
    throw new Error(`The GitHub App is not installed on ${repository}.`);
  }
  return canonical;
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

  try {
    const { pr, files } = await fetchPullRequest(ref, token);
    const { contexts, skipped } = await buildFileContexts(ref, pr, files, token);
    if (contexts.length === 0) {
      console.log(`No reviewable changes found for ${url} (${skipped.length} file(s) skipped).`);
      return;
    }

    const conventions = await loadReviewConventions(payload.installation?.id, `${ref.owner}/${ref.repo}`);
    const result = await reviewDiff(
      pullRequest.title ?? pr.title ?? "",
      pullRequest.body ?? pr.body ?? "",
      contexts,
      conventions,
    );
    await postReview(ref, sha, result, token, skipped);
    console.log(
      `Webhook review posted for ${url}: ${result.comments.length} comment(s), ` +
        `${contexts.length} file(s) reviewed, ${skipped.length} not fully reviewed.`,
    );
  } catch (err) {
    await postReviewFailure(ref, sha, describeReviewFailure(err), token).catch((commentErr) => {
      console.error("Could not post review failure comment:", commentErr instanceof Error ? commentErr.message : commentErr);
    });
    throw err;
  }
}

/** A short, non-sensitive reason for the PR failure comment; details stay in the logs. */
function describeReviewFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("All configured AI providers failed")) {
    return "the AI provider could not process the request. It may be temporarily unavailable or the change may be too large.";
  }
  if (message.includes("HTTP 422")) {
    return "GitHub rejected the review comments.";
  }
  return "an internal error occurred.";
}

/** Minimum gap between relearning a target repository after merges. */
const TARGET_RELEARN_COOLDOWN_MS = 10 * 60 * 1000;
/** Convention sources (and targets on setup save) are relearned at most this often. */
const SOURCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function processConventionLearning(
  installationId: number | undefined,
  source: ConventionSource,
  installationToken: string,
  maxAgeMs: number,
): Promise<void> {
  const [owner, repo] = source.repository.split("/");
  const outcome = await learnConventionsIfStale(
    repositoryScope(installationId, source.repository, source.visibility),
    owner,
    repo,
    maxAgeMs,
    source.visibility === "public" ? undefined : installationToken,
    source.visibility === "public",
  );
  if (outcome.status === "skipped") {
    console.log(`Convention learning skipped for ${source.repository}: ${outcome.reason}.`);
  } else {
    console.log(`Learned ${outcome.rules.length} ${source.visibility} convention(s) for ${source.repository}.`);
  }
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
    TARGET_RELEARN_COOLDOWN_MS,
  );

  // Sources are not affected by this merge; refresh only the ones that are stale.
  if (payload.installation?.id) {
    const configuration = await loadConventionConfiguration(payload.installation.id, repository);
    for (const rawSource of configuration?.conventionSources ?? []) {
      const source = normalizeConventionSource(rawSource);
      try {
        await processConventionLearning(payload.installation.id, source, token, SOURCE_MAX_AGE_MS);
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
      res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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
  registerAuthRoutes(app);

  app.get("/api/github/setup", async (req, res) => {
    const installationId = Number(req.query.installation_id);
    const requestedRepository = parseRepositoryName(req.query.repository);
    if (!Number.isInteger(installationId) || installationId <= 0) {
      res.status(400).json({ error: "A valid installation_id is required." });
      return;
    }
    if (!requireInstallationAccess(req, res, installationId)) return;

    try {
      const repositories = await getInstallationRepositories(installationId);
      res.json({
        installationId,
        repositories: repositories.map((repository) => ({
          fullName: repository.full_name,
          private: repository.private,
        })),
        configuration: requestedRepository
          ? await loadConventionConfiguration(
            installationId,
            canonicalNames(repositories).get(requestedRepository.toLowerCase()) ?? requestedRepository,
          )
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
    const requestedRepository = parseRepositoryName(req.body?.repository);
    const requestedSources: unknown[] = Array.isArray(req.body?.conventionSources)
      ? req.body.conventionSources
      : [];
    const conventionSources = requestedSources
      .map((source) => parseRepositoryName(source))
      .filter((source): source is string => Boolean(source));
    const allowPublicSource = req.body?.allowPublicSource === true;

    if (!Number.isInteger(installationId) || installationId <= 0 || !requestedRepository) {
      res.status(400).json({ error: "installationId and repository are required." });
      return;
    }
    if (!requireInstallationAccess(req, res, installationId)) return;

    try {
      const accessible = canonicalNames(await getInstallationRepositories(installationId));
      const repository = accessible.get(requestedRepository.toLowerCase());
      const missingRepositories = repository ? [] : [requestedRepository];
      const sourceConfigurations: ConventionSource[] = [];
      const seenSources = new Set<string>();
      const addSource = (source: ConventionSource): void => {
        const key = source.repository.toLowerCase();
        if (seenSources.has(key)) return;
        seenSources.add(key);
        sourceConfigurations.push(source);
      };

      for (const source of conventionSources) {
        if (seenSources.has(source.toLowerCase())) continue;

        const installed = accessible.get(source.toLowerCase());
        if (installed) {
          addSource({ repository: installed, visibility: "installation" });
          continue;
        }

        const publicName = allowPublicSource ? await getPublicRepositoryName(source) : null;
        if (publicName) {
          addSource({ repository: publicName, visibility: "public" });
          continue;
        }

        missingRepositories.push(source);
      }

      if (!repository || missingRepositories.length > 0) {
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

      void processConventionLearning(installationId, { repository, visibility: "installation" }, token, SOURCE_MAX_AGE_MS).catch((err) => {
        console.error(`Initial convention learning skipped for ${repository}:`, err instanceof Error ? err.message : err);
      });
      for (const source of sourceConfigurations) {
        void processConventionLearning(installationId, source, token, SOURCE_MAX_AGE_MS).catch((err) => {
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
    const requestedRepository = parseRepositoryName(req.query.repository);
    if (!Number.isInteger(installationId) || installationId <= 0 || !requestedRepository) {
      res.status(400).json({ error: "installation_id and repository are required." });
      return;
    }
    if (!requireInstallationAccess(req, res, installationId)) return;

    try {
      const repository = await resolveInstalledRepository(installationId, requestedRepository);
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
    const requestedRepository = parseRepositoryName(req.body?.repository);
    const severity = req.body?.severity;
    const rule = typeof req.body?.rule === "string" ? req.body.rule.trim() : "";
    const rationale = typeof req.body?.rationale === "string" ? req.body.rationale.trim() : "";
    if (!Number.isInteger(installationId) || installationId <= 0 || !requestedRepository || !rule || !rationale ||
      !["bug", "security", "style", "suggestion", "performance"].includes(severity)) {
      res.status(400).json({ error: "repository, rule, rationale, and a valid severity are required." });
      return;
    }
    if (!requireInstallationAccess(req, res, installationId)) return;

    try {
      const repository = await resolveInstalledRepository(installationId, requestedRepository);
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
    const requestedRepository = parseRepositoryName(req.body?.repository);
    const id = typeof req.body?.id === "string" ? req.body.id : "";
    if (!Number.isInteger(installationId) || installationId <= 0 || !requestedRepository || !id) {
      res.status(400).json({ error: "installationId, repository, and rule id are required." });
      return;
    }
    if (!requireInstallationAccess(req, res, installationId)) return;

    try {
      const repository = await resolveInstalledRepository(installationId, requestedRepository);
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
    const requestedRepository = parseRepositoryName(req.body?.repository);
    const id = typeof req.body?.id === "string" ? req.body.id : "";
    if (!Number.isInteger(installationId) || installationId <= 0 || !requestedRepository || !id) {
      res.status(400).json({ error: "installationId, repository, and rule id are required." });
      return;
    }
    if (!requireInstallationAccess(req, res, installationId)) return;

    try {
      const repository = await resolveInstalledRepository(installationId, requestedRepository);
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
    res.json({ ok: true, webhook: Boolean(config.githubWebhookSecret), auth: isAuthConfigured() });
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
    console.log(`PRHawk running on http://localhost:${port}`);
  });
}

startServer();
