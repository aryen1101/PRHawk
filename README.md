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
- Automatic convention learning after merged pull requests
- Optional convention learning from public repositories
- OpenAI-first with Groq fallback
- Public install landing page
- CLI for dry runs and local workflows
- MongoDB persistence for installation/repository conventions
- No personal GitHub tokens required for normal App users

## Project structure

```text
PRHawk/
├── backend/
│   └── src/
│       ├── index.ts                 # Express server + webhook endpoint
│       ├── cli.ts                   # Local review and learning CLI
│       ├── github/
│       │   ├── appAuth.ts           # GitHub App JWT/install token flow
│       │   ├── prService.ts         # Pull request and diff loading
│       │   └── reviewPublishers.ts  # Posts GitHub reviews
│       ├── review/                  # Prompts, schemas, and review engine
│       ├── conventions/             # MongoDB-backed learned conventions
│       └── llm/                     # OpenAI/Groq-compatible completion flow
├── frontend/
│   └── src/
│       ├── pages/LandingPage.jsx    # Public install page
│       └── App.jsx
└── test.md                          # Complete webhook test guide
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

Create `backend/.env.local` from `backend/.env.example` and configure:

```env
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/

GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

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

Set the GitHub App **Setup URL** to the deployed setup route:

```text
https://pr-hawk.vercel.app/setup
```

After installation, GitHub redirects the user to this page. The user selects the repository to review and may optionally enter another repository as a convention source. Private sources require the App to be installed. Public sources can be enabled explicitly and are read anonymously.

For local testing, expose port `3000` with an HTTPS tunnel such as ngrok, then use:

```text
https://YOUR_TUNNEL_HOST/api/github/webhook
```

The complete setup and test sequence is in [test.md](test.md).

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

Open `http://localhost:5173`. Set `VITE_GITHUB_APP_INSTALL_URL` in `frontend/.env.local` or the deployment environment to the App installation URL:

```env
VITE_GITHUB_APP_INSTALL_URL=https://github.com/apps/YOUR_APP_SLUG/installations/new
```

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

Learned conventions are stored in MongoDB and are scoped to the GitHub installation/repository that uses them. The CLI remains available for local or administrative learning workflows.

## API endpoints

```text
POST /api/github/webhook  GitHub App webhook receiver
GET  /api/github/setup    List repositories available to an App installation
POST /api/github/setup    Save target and optional convention-source repositories
GET  /api/health          Service health check
```

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

- Keep `backend/.env.local` out of Git.
- Never commit a GitHub App private key or webhook secret.
- Store AI keys and MongoDB credentials only in deployment secrets.
- Verify every webhook using `X-Hub-Signature-256`.
- Give the GitHub App only the minimum repository permissions required.
- Rotate any credential that is exposed.
