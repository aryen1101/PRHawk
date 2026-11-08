import crypto from "node:crypto";

const GITHUB_API = "https://api.github.com";

export type InstallationRepository = {
  full_name: string;
  name: string;
  private: boolean;
};

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required for GitHub App webhook reviews.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`;
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const jwt = createAppJwt();
  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub App installation token request failed (HTTP ${response.status}).`);
  }

  const data = await response.json() as { token?: string };
  if (!data.token) throw new Error("GitHub did not return an installation token.");
  return data.token;
}

export async function getInstallationRepositories(installationId: number): Promise<InstallationRepository[]> {
  const token = await getInstallationToken(installationId);
  const repositories: InstallationRepository[] = [];

  for (let page = 1; page <= 10; page++) {
    const response = await fetch(
      `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub installation repositories request failed (HTTP ${response.status}).`);
    }

    const data = await response.json() as { repositories?: InstallationRepository[] };
    const pageRepositories = data.repositories ?? [];
    repositories.push(...pageRepositories);
    if (pageRepositories.length < 100) break;
  }

  return repositories;
}
