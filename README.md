# 🦅 PRHawk

**AI-powered GitHub Pull Request reviewer.** Sign in, paste a PR URL, and get inline code comments, a quality score, and a merge recommendation — posted directly back to GitHub.

PRHawk also *learns* your team's coding conventions from merged PR history and applies them as additional review rules on every future review.

🔗 **Live:** frontend on Vercel ([pr-hawk.vercel.app](https://pr-hawk.vercel.app)) · backend API on Render.

---

## ✨ Features

- **Account-based access** — email/password sign-up & login (powered by [better-auth](https://better-auth.com), sessions stored in MongoDB). The dashboard is gated behind authentication.
- **Automated inline comments** — bugs, security issues, performance regressions, style violations, and suggestions, pinned to the exact line.
- **Risk summary** — overall quality score (0–100), highest-risk changes, and an `approve / request_changes / comment` merge decision.
- **Convention learning** — analyses your repo's last 10 merged PRs and extracts team-specific rules that are applied on all future reviews.
- **Bring your own keys** — users can supply their own GitHub token and OpenRouter key in the UI (Settings), so reviews run under their own identity and quota instead of the server's.
- **Graceful posting** — if the GitHub token can't post the review (e.g. insufficient scope), the analysis is still returned to the UI with a clear warning instead of failing.
- **CLI mode** — run reviews and convention learning from the terminal without the web server or auth.

---

## 🧱 Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 19, Vite, React Router v7, better-auth React client, lucide-react |
| **Backend** | Node + Express 5, TypeScript (run directly via `tsx`), Octokit, OpenAI SDK (Groq / OpenRouter), Zod |
| **Auth & data** | better-auth (email/password) + MongoDB |
| **Hosting** | Vercel (frontend) · Render (backend) · MongoDB Atlas |

---

## 🗂️ Project Structure

```
PRHawk/
├── backend/          # Express REST API + CLI (TypeScript)
│   ├── src/
│   │   ├── index.ts           # Entry point: server or CLI; CORS + routes
│   │   ├── config.ts          # Environment-variable configuration
│   │   ├── types.ts           # Shared TypeScript types
│   │   ├── lib/
│   │   │   └── auth.ts        # better-auth instance (email/password, cookies)
│   │   ├── db/
│   │   │   └── index.ts       # MongoClient (used by better-auth)
│   │   ├── github/            # GitHub API integration (Octokit)
│   │   │   ├── client.ts      # Octokit client factory (central or custom token)
│   │   │   ├── diffParser.ts  # Parses unified diffs → added line numbers
│   │   │   ├── prService.ts   # Fetches PR metadata & file contents
│   │   │   └── reviewPublishers.ts  # Posts reviews & comments to GitHub
│   │   ├── llm/
│   │   │   └── groq.ts        # OpenAI-compatible client (Groq / OpenRouter)
│   │   ├── review/
│   │   │   ├── prompts.ts     # System & user prompt builders
│   │   │   ├── schema.ts      # Zod schemas for structured LLM output
│   │   │   └── reviewer.ts    # Orchestrates the review pipeline
│   │   └── conventions/
│   │       ├── learner.ts     # Extracts team conventions from merged PRs
│   │       └── store.ts       # Reads/writes conventions/rules.json
│   └── .env.example           # ← copy to backend/.env and fill in
└── frontend/         # React + Vite web UI
    └── src/
        ├── main.jsx           # Mounts <App/> inside <BrowserRouter>
        ├── App.jsx            # Routes: /login, /signup, protected dashboard
        ├── lib/
        │   ├── api.js         # Wrappers around the backend REST API
        │   ├── auth.js        # better-auth React client (authClient)
        │   └── storageKeys.js # localStorage keys + per-session cleanup
        ├── hooks/
        │   └── usePersistentState.js  # localStorage-backed React state
        ├── pages/
        │   ├── LoginPage.jsx
        │   └── SignupPage.jsx
        └── components/
            ├── AuthGuard.jsx  # Redirects to /login when no session
            ├── Header.jsx · ToastContainer.jsx
            ├── ReviewTab.jsx  + review/   # input, loader, summary, findings
            ├── RulesTab.jsx   + rules/    # toolbar, add/edit, learn panel
            └── OnboardingOverlay.jsx + onboarding/  # settings / custom keys
```

---

## ⚙️ Environment Setup

### Backend — `backend/.env`

```bash
cp backend/.env.example backend/.env
```

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | One of these two | API key for [OpenRouter](https://openrouter.ai). When set, OpenRouter is the LLM provider. |
| `GROQ_API_KEY` | One of these two | API key for [Groq](https://console.groq.com). Used when `OPENROUTER_API_KEY` is not set. |
| `GITHUB_TOKEN` | ✅ Yes | GitHub PAT used to fetch PRs and post reviews. Classic token with `repo` (private) or `public_repo` (public). |
| `MONGODB_URL` | ✅ Yes | MongoDB connection string for better-auth (users/sessions). The server **fails to start** if unset. e.g. `mongodb+srv://…` |
| `BETTER_AUTH_SECRET` | ✅ Yes | Secret used to sign sessions. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | ✅ Yes | Public base URL of **this backend** (e.g. `http://localhost:3000` locally, the Render URL in prod). |
| `MODEL` | No | Override the LLM model. Defaults to `google/gemini-2.5-flash` (OpenRouter) or `llama-3.3-70b-versatile` (Groq). |
| `PORT` | No | Port the Express server listens on. Defaults to `3000`. (Render injects this — don't hardcode it there.) |
| `APP_SECRET` | No | Legacy `x-access-key` gate, predates better-auth. Leave empty. |

### Frontend — `frontend/.env`

```bash
cp frontend/.env.example frontend/.env   # optional for local dev
```

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API. **Leave empty for local dev** (requests stay relative and use the Vite proxy → `localhost:3000`). Set to the backend's public URL for production builds. |

---

## 🚀 Running Locally

You'll need a MongoDB instance (local or [Atlas](https://www.mongodb.com/atlas) free tier) for auth.

### Backend

```bash
cd backend
npm install
npm start          # Express server at http://localhost:3000
```

### Frontend (development)

```bash
cd frontend
npm install
npm run dev        # Vite dev server, proxies /api/* to :3000
```

Open [http://localhost:5173](http://localhost:5173), create an account, and you're in.

### Production build

```bash
cd frontend && npm run build   # Outputs to frontend/dist/
cd ../backend && npm start     # Also serves frontend/dist as static files
```

A single backend process can serve both the API and the built frontend when they're co-located.

---

## ☁️ Deployment (Vercel + Render)

PRHawk is deployed as **two services on different domains**, so a few things are wired specifically for that:

**Backend (Render)**
- Root Directory: `backend` · Build: `npm install` · Start: `npm start` (no compile step — `tsx` runs TypeScript directly).
- Env vars: all the backend vars above, including `MONGODB_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` (= the Render URL). Don't set `PORT`.
- In MongoDB Atlas, allow Render's network access (`0.0.0.0/0` or Render's IPs).

**Frontend (Vercel)**
- Root Directory: `frontend` · Build: `npm run build` · Output: `dist`.
- Set `VITE_API_BASE_URL` to the Render backend URL (or commit it in `frontend/.env.production`).

**Cross-domain auth** — because the two run on different domains:
- The backend's CORS allows the frontend origin and sends `Access-Control-Allow-Credentials: true` (allowed origins are listed in `backend/src/index.ts`; trusted origins in `backend/src/lib/auth.ts`).
- Session cookies are issued with `SameSite=None; Secure` so the browser sends them cross-site. Browsers that block third-party cookies may still reject them — the most robust alternative is to put both behind one domain (a Vercel rewrite of `/api/*`, or sub-domains with `crossSubDomainCookies`).

---

## 🖥️ CLI Usage

Reviews and convention learning can run from the terminal without the web server or authentication.

```bash
cd backend

# Review a pull request
npm run review https://github.com/owner/repo/pull/123

# Learn conventions from a repository's merged PR history
npm run learn owner/repo
# or
npm run learn https://github.com/owner/repo
```

---

## 🔄 How It Works

### Authentication

- The React app renders `/login` and `/signup`; every other route is wrapped in `AuthGuard`, which checks the better-auth session and redirects to `/login` when there isn't one.
- Sign-up/sign-in call the backend's `/api/auth/*` routes (handled by better-auth), which store users and sessions in MongoDB and set a session cookie.
- Per-user dashboard state (last review, active tab) lives in `localStorage` and is cleared on login/logout so it never leaks between accounts on a shared browser.

### PR Review

1. You paste a GitHub PR URL into the UI (or pass it to the CLI).
2. The backend fetches the PR metadata and changed files via the GitHub API.
3. Each file's unified diff is parsed to identify the exact added/modified line numbers.
4. The full file content at the PR's head commit is fetched for context.
5. Saved team conventions are loaded from `conventions/rules.json`.
6. A structured prompt (diff, numbered file content, addable lines, conventions) is sent to the LLM.
7. The LLM returns JSON (validated against a Zod schema) with inline comments and a risk summary.
8. Comments referencing lines outside the "addable" set are discarded to prevent ghost comments.
9. The review is posted to the PR as inline comments + a summary. If posting fails (token permissions), the analysis is still returned to the UI with a `postWarning`.

### Convention Learning

1. You provide a repository (`owner/repo`) in the UI or CLI.
2. The backend fetches recent closed PRs and keeps the 10 most recently merged.
3. Their diff patches are sent to the LLM.
4. The LLM extracts recurring patterns — naming, error handling, testing expectations, etc. — as concrete rules with severity tags.
5. Rules are saved to `backend/conventions/rules.json` and applied to all future reviews.

---

## 🔑 GitHub Token Notes

| Use case | Token |
|---|---|
| Review **public** repos | Classic token with `public_repo` scope |
| Review **private** repos | Classic token with `repo` scope (and access to the repo) |
| Review **another account's** repo | That account's token; for private repos you must be a collaborator |

> ⚠️ **Fine-grained tokens** are bound to a single resource owner and can only *write* to repos that owner controls — they **cannot post reviews to a repo owned by a different account**, even a public one. Use a **classic** token with `public_repo`/`repo` for cross-account reviews. Reviews are posted with `event: "COMMENT"`, so reviewing your own PR works (GitHub only blocks self-*approval*).
