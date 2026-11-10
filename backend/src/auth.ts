import crypto from "node:crypto";
import type { CookieOptions, Express, Request, Response } from "express";
import { config } from "./config.js";

const GITHUB_API = "https://api.github.com";
const SESSION_COOKIE = "prhawk_session";
const STATE_COOKIE = "prhawk_oauth_state";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_INSTALLATION_PAGES = 5;

export interface Session {
  userId: number;
  login: string;
  installationIds: number[];
  exp: number;
}

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

function sessionSecret(): string {
  const secret = config.sessionSecret;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return secret;
}

export function isAuthConfigured(): boolean {
  return Boolean(config.githubClientId && config.githubClientSecret && config.sessionSecret.length >= 32);
}

function sign(value: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof session.exp !== "number" || session.exp < Date.now()) return null;
    if (!Array.isArray(session.installationIds)) return null;
    return session;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.header("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function getSession(req: Request): Session | null {
  return decodeSession(readCookie(req, SESSION_COOKIE));
}

/**
 * Ensures the request carries a valid session whose GitHub user can access
 * the given installation. Sends an error response and returns false otherwise.
 */
export function requireInstallationAccess(req: Request, res: Response, installationId: number): boolean {
  let session: Session | null;
  try {
    session = getSession(req);
  } catch (err) {
    console.error("Session check failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "GitHub sign-in is not configured on the server." });
    return false;
  }

  if (!session) {
    res.status(401).json({ error: "Sign in with GitHub to manage PRHawk settings." });
    return false;
  }
  if (!session.installationIds.includes(installationId)) {
    res.status(403).json({ error: "Your GitHub account cannot manage this installation." });
    return false;
  }
  return true;
}

async function exchangeCodeForUserToken(code: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`GitHub sign-in failed: ${data.error_description || data.error || `HTTP ${response.status}`}`);
  }
  return data.access_token;
}

async function githubUserRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub user request ${path} failed (HTTP ${response.status}).`);
  }
  return await response.json() as T;
}

/** Installations of this GitHub App that the signed-in user can access. */
async function fetchUserInstallationIds(token: string): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= MAX_INSTALLATION_PAGES; page++) {
    const data = await githubUserRequest<{ installations?: { id: number }[] }>(
      `/user/installations?per_page=100&page=${page}`,
      token,
    );
    const installations = data.installations ?? [];
    ids.push(...installations.map((installation) => installation.id));
    if (installations.length < 100) break;
  }
  return ids;
}

function redirectToSetup(res: Response, params: Record<string, string> = {}): void {
  const query = new URLSearchParams(params).toString();
  res.redirect(`/setup${query ? `?${query}` : ""}`);
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/github/login", (_req, res) => {
    if (!isAuthConfigured()) {
      res.status(500).json({ error: "GitHub sign-in is not configured on the server." });
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: STATE_TTL_MS });
    const params = new URLSearchParams({ client_id: config.githubClientId, state });
    if (config.githubOAuthRedirectUri) params.set("redirect_uri", config.githubOAuthRedirectUri);
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const requestedInstallation = Number(req.query.installation_id);
    const expectedState = readCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, cookieOptions);

    if (typeof req.query.error === "string") {
      redirectToSetup(res, { auth_error: "GitHub sign-in was cancelled." });
      return;
    }
    if (!code) {
      redirectToSetup(res, { auth_error: "GitHub did not return a sign-in code." });
      return;
    }
    // Logins started from /api/auth/github/login carry a state value that must match.
    // GitHub's install-time authorization redirect does not include state.
    if (state && (!expectedState || !safeEqual(state, expectedState))) {
      redirectToSetup(res, { auth_error: "Sign-in expired or was tampered with. Please try again." });
      return;
    }

    try {
      const token = await exchangeCodeForUserToken(code);
      const [user, installationIds] = await Promise.all([
        githubUserRequest<{ id: number; login: string }>("/user", token),
        fetchUserInstallationIds(token),
      ]);

      const session: Session = {
        userId: user.id,
        login: user.login,
        installationIds,
        exp: Date.now() + SESSION_TTL_MS,
      };
      res.cookie(SESSION_COOKIE, encodeSession(session), { ...cookieOptions, maxAge: SESSION_TTL_MS });

      redirectToSetup(
        res,
        installationIds.includes(requestedInstallation) ? { installation_id: String(requestedInstallation) } : {},
      );
    } catch (err) {
      console.error("GitHub sign-in failed:", err instanceof Error ? err.message : err);
      redirectToSetup(res, { auth_error: "GitHub sign-in failed. Please try again." });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    let session: Session | null = null;
    try {
      session = getSession(req);
    } catch (err) {
      console.error("Session check failed:", err instanceof Error ? err.message : err);
    }
    if (!session) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, login: session.login, installationIds: session.installationIds });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.sendStatus(204);
  });
}
