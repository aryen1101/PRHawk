# PRHawk

AI code review for GitHub pull requests, delivered where the work happens.

PRHawk is a GitHub App that listens for pull request events, reviews changed lines with an OpenAI-compatible model, falls back to Groq when needed, and posts an inline review back to GitHub.

## How it works

```text
Pull request opened or updated
        ↓
GitHub App webhook
        ↓
Signature verification
        ↓
Installation access token
        ↓
Changed files + repository conventions
        ↓
OpenAI Astra
        ↓ on failure
Groq fallback
        ↓
Summary and inline GitHub comments
```

There is no email/password account system and no manual PR URL form. Users install the GitHub App once, select repositories, and reviews happen automatically.

The CLI remains available for maintainers who want local dry runs or administrative workflows. Normal convention learning happens automatically after merged pull requests.

## Features

- Automatic reviews through GitHub App webhooks
- Inline comments on valid changed lines
- Quality score and merge recommendation
- Review size limits for large pull requests, with skipped files listed in the summary
- A pull request comment when a review fails
- Automatic convention learning after merged pull requests, refreshed at most once a day per source
- Optional convention learning from public repositories
- Multiple convention sources and custom rule management
- GitHub sign-in for the settings page; users only manage installations they can access
- OpenAI-first with Groq fallback
- Landing page with a real example review, and a settings page for sources and rules
- CLI for dry runs and local workflows
- MongoDB persistence for installation/repository conventions
- No personal GitHub tokens required for normal App users

## Project structure

```text
PRHawk/
├── backend/
│   └── src/
│       ├── index.ts                 # Express server, webhook, setup and rules APIs
│       ├── auth.ts                  # GitHub sign-in and session cookies
│       ├── cli.ts                   # Local review and learning CLI
│       ├── github/
│       │   ├── appAuth.ts           # GitHub App JWT/install token flow
│       │   ├── prService.ts         # Pull request loading and the review size budget
│       │   └── reviewPublishers.ts  # Posts GitHub reviews and failure comments
│       ├── review/                  # Prompts, schemas, file filter, and review engine
│       ├── conventions/             # Learned conventions, scopes, and MongoDB store
│       └── llm/                     # OpenAI/Groq-compatible completion flow
├── frontend/
│   ├── vercel.json                  # Proxies /api to Render; SPA routes
│   └── src/
│       ├── pages/                   # LandingPage.jsx (/), SetupPage.jsx (/setup)
│       ├── components/              # Brand, ReviewPreview, SeverityTag
│       ├── styles/                  # Design tokens, base styles, settings screen
│       ├── hooks/useLandingMotion.js  # GSAP and Lenis, off under reduced motion
│       ├── data/exampleReview.js    # The real review shown on the landing page
│       └── lib/                     # Config, severities, code highlighter
└── architecture.md                  # System design and flows
```

## Local setup

Requirements:

- Node.js 22+
- MongoDB or MongoDB Atlas
- GitHub App credentials
- OpenAI and/or Groq API key

Install dependencies:

```powershell
cd backend
npm install

cd ../frontend
npm install
```

Create `backend/.env` from `backend/.env.example` and configure:

```env
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/

GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

GITHUB_CLIENT_ID=your_app_client_id
GITHUB_CLIENT_SECRET=your_app_client_secret
SESSION_SECRET=at_least_32_random_characters

OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-6-astra

GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
```

OpenAI is attempted first. If the request fails or returns unusable output, the same review is retried through Groq.

## GitHub App setup

Create a GitHub App under **Settings → Developer settings → GitHub Apps**.

Set these repository permissions:

- Contents: Read-only
- Pull requests: Read and write
- Metadata: Read-only

Enable the **Pull request** webhook event and configure the production webhook URL:

```text
https://prhawk-1.onrender.com/api/github/webhook
```

Install the App on the repositories that should receive automatic reviews.

Enable **Request user authorization (OAuth) during installation** and set the GitHub App **Redirect URL** (also called the callback URL) to:

```text
https://pr-hawk.vercel.app/api/auth/github/callback
```

The **Setup URL** is not needed: with this option on, GitHub sends users to the redirect URL after installing.

Generate a client secret on the App settings page and set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` (32+ random characters) on the backend. Leave `VITE_API_BASE_URL` empty on Vercel; `frontend/vercel.json` proxies `/api` to Render.

After installation, GitHub asks the user to authorize PRHawk, signs them in, and redirects to `/setup`. Only GitHub users who can access an installation can change its settings. The user selects the repository to review, adds or removes multiple convention sources, and manages custom rules. Private sources require the App to be installed. Public sources can be enabled explicitly and are read anonymously.

For local testing, expose port `3000` with an HTTPS tunnel such as ngrok, then use:

```text
https://YOUR_TUNNEL_HOST/api/github/webhook
```

## Run locally

Start the backend:

```powershell
cd backend
npm.cmd start
```

The webhook server runs at `http://localhost:3000`.

Start the public frontend in a second terminal:

```powershell
cd frontend
npm.cmd run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the backend on port 3000, so keep `VITE_API_BASE_URL` empty. Set `VITE_GITHUB_APP_INSTALL_URL` in `frontend/.env` or the deployment environment to the App installation URL:

```env
VITE_API_BASE_URL=
VITE_GITHUB_APP_INSTALL_URL=https://github.com/apps/YOUR_APP_SLUG/installations/new
```

To sign in to the settings page locally, add `http://localhost:5173/api/auth/github/callback` to the App's redirect URLs and set the same value as `GITHUB_OAUTH_REDIRECT_URI` in `backend/.env`. GitHub uses the first redirect URL in the list for sign-in during installation, so keep the production URL first.

## CLI

The CLI does not require the web server or a browser.

Review a pull request and post the result:

```powershell
cd backend
npm.cmd run review -- https://github.com/owner/repository/pull/123
```

Analyze without posting:

```powershell
npm.cmd run review -- https://github.com/owner/repository/pull/123 --dry-run
```

Learn conventions from merged pull requests:

```powershell
npm.cmd run learn -- owner/repository
```

The CLI reads and writes the same rules as webhook reviews:

| Repository | Credentials | Rules scope |
|---|---|---|
| PRHawk App installed | App installation token (reviews are posted as the App) | `github-installation:<id>:owner/repo`, plus configured sources and custom rules |
| Not installed, public | `GITHUB_TOKEN`, or anonymous (dry runs and learning only) | `github-public:owner/repo` |
| Not installed, private | `GITHUB_TOKEN` | `github-repository:owner/repo` |

`npm run learn` always relearns, regardless of when the repository was last learned.

## API endpoints

```text
POST   /api/github/webhook          GitHub App webhook receiver
GET    /api/auth/github/login       Start GitHub sign-in
GET    /api/auth/github/callback    GitHub sign-in and install redirect; sets the session cookie
GET    /api/auth/me                 Signed-in user and installation IDs, or 401
POST   /api/auth/logout             Clear the session cookie
GET    /api/github/setup            List repositories available to an App installation
POST   /api/github/setup            Save target and optional convention-source repositories
GET    /api/github/rules            View target, source and effective rules
POST   /api/github/rules            Add a custom target rule
PATCH  /api/github/rules            Update or enable/disable a custom rule
DELETE /api/github/rules            Delete a custom target rule
GET    /api/health                  Service, webhook-secret and sign-in configuration status
```

Every `/api/github/setup` and `/api/github/rules` request needs a signed-in session whose GitHub user can access the requested installation (`401` without a session, `403` for another installation).

The webhook returns `202 Accepted` after a valid event is accepted and runs review or convention learning in the background. Pull requests opened, reopened, or updated are reviewed; merged pull requests trigger convention learning.

## Verification

```powershell
cd frontend
npm.cmd run lint
npm.cmd run build

cd ../backend
npx.cmd tsc --noEmit
```

## Security

- Keep `backend/.env` out of Git.
- Never commit a GitHub App private key, client secret, webhook secret or `SESSION_SECRET`.
- Store AI keys and MongoDB credentials only in deployment secrets.
- Verify every webhook using `X-Hub-Signature-256`.
- Give the GitHub App only the minimum repository permissions required.
- Rotate any credential that is exposed.
