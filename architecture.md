# PRHawk — System Design and Architecture

## 1. Product overview

PRHawk is an AI-powered GitHub pull-request review system. It is implemented as a GitHub App, so users install it on selected repositories and receive automatic reviews whenever pull requests are opened or updated.

The primary user experience happens inside GitHub. The PRHawk website is a public landing page used to explain the product and redirect users to the GitHub App installation flow.

The system does not require user accounts, email/password authentication, or manual PR URL submission.

## 2. Design goals

- Automatically review pull requests through GitHub webhooks.
- Keep the user workflow inside GitHub.
- Review only changed lines so comments are actionable.
- Use repository-specific conventions when available.
- Use OpenAI as the primary model and Groq as a fallback.
- Never expose GitHub App private keys or AI credentials to the browser.
- Support local development through an HTTPS tunnel and production deployment behind a public HTTPS URL.
- Provide a CLI for maintainers without making it part of the normal user workflow.

## 3. High-level architecture

```text
                              ┌──────────────────────────┐
                              │        End user           │
                              │  Installs PRHawk App     │
                              └────────────┬─────────────┘
                                           │
                                           ▼
┌────────────────────┐       ┌──────────────────────────┐
│ PRHawk Frontend    │──────▶│ GitHub App installation  │
│ React + Vite       │       │ Repository selection     │
└────────────────────┘       └────────────┬─────────────┘
                                           │
                              Pull request event
                                           │
                                           ▼
                         ┌────────────────────────────────┐
                         │ GitHub Webhook                  │
                         │ POST /api/github/webhook       │
                         └───────────────┬────────────────┘
                                         │
                                         ▼
                         ┌────────────────────────────────┐
                         │ PRHawk Backend                  │
                         │ Express + TypeScript            │
                         └───────────────┬────────────────┘
                                         │
                 ┌───────────────────────┼──────────────────────┐
                 ▼                       ▼                      ▼
        ┌────────────────┐    ┌──────────────────┐    ┌─────────────────┐
        │ GitHub API     │    │ MongoDB          │    │ AI providers    │
        │ PR and files   │    │ Conventions     │    │ OpenAI → Groq   │
        └────────────────┘    └──────────────────┘    └─────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ GitHub PR review         │
                              │ Summary + inline comments│
                              └──────────────────────────┘
```

## 4. Main components

### 4.1 React frontend

Location:

```text
frontend/src/
```

Important files:

```text
App.jsx                    Application route entry point
pages/LandingPage.jsx     Public product and installation page
main.jsx                  React bootstrap
index.css                 Landing page styling
```

The frontend provides the public installation page and a post-install setup page. The setup page lists repositories accessible to the GitHub App and lets the user optionally select another repository as a convention source. It contains no secrets; all GitHub API calls are performed by the backend.

The installation URL is configured with:

```env
VITE_GITHUB_APP_INSTALL_URL=https://github.com/apps/YOUR_APP_SLUG/installations/new
```

### 4.2 Express backend

Location:

```text
backend/src/index.ts
```

The backend provides:

```text
POST /api/github/webhook    GitHub App webhook receiver
GET  /api/github/setup      List repositories available to an App installation
POST /api/github/setup      Save target and optional convention-source repositories
GET  /api/health            Service health check
```

The backend also serves the built frontend in deployments where the frontend build is copied into the application layout.

### 4.3 GitHub App authentication

Location:

```text
backend/src/github/appAuth.ts
```

The GitHub App uses two separate security mechanisms:

1. Webhook signature verification
2. Installation access-token generation

For webhook verification, GitHub sends an `X-Hub-Signature-256` header. PRHawk calculates an HMAC-SHA256 signature using `GITHUB_WEBHOOK_SECRET` and compares the signatures using a timing-safe comparison.

For GitHub API access, PRHawk:

1. Creates a short-lived App JWT using the App ID and RSA private key.
2. Exchanges the JWT for an installation access token.
3. Uses the installation token to read the pull request and post the review.

The installation token is scoped to the repositories where the user installed the App.

### 4.4 GitHub integration

Locations:

```text
backend/src/github/client.ts
backend/src/github/prService.ts
backend/src/github/diffParser.ts
backend/src/github/reviewPublishers.ts
```

The GitHub integration performs four main operations:

- Fetch pull-request metadata.
- Fetch changed files and patches.
- Fetch file content at the pull request head commit.
- Publish a review with a summary and inline comments.

The diff parser identifies added line numbers. The review engine later removes any AI-generated comment that does not point to an added line. This prevents invalid inline comments on unchanged code.

### 4.5 Review engine

Locations:

```text
backend/src/review/prompts.ts
backend/src/review/reviewer.ts
backend/src/review/schema.ts
```

The review engine combines:

- Pull-request title.
- Pull-request description.
- Changed-file patches.
- Current file content where available.
- Learned repository conventions.

The model must return structured JSON matching the review schema. The schema contains the review summary, quality score, recommendation, and individual findings.

The backend validates the response with Zod before publishing it. This protects the GitHub publishing layer from malformed model output.

### 4.6 AI provider layer

Location:

```text
backend/src/llm/groq.ts
```

Although the filename is historical, the module is the provider abstraction for OpenAI-compatible chat-completion APIs.

The provider order is:

```text
OpenAI primary model
       │ failure
       ▼
Groq fallback model
```

Each configured provider can be retried up to three times. The response is requested as a JSON object and parsed against the review schema.

Configuration:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-6-astra

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
```

`OPENAI_BASE_URL` also allows an OpenAI-compatible gateway to be used without changing application code.

### 4.7 MongoDB conventions store

Locations:

```text
backend/src/db/index.ts
backend/src/conventions/store.ts
backend/src/conventions/learner.ts
```

MongoDB is used for learned repository conventions, not authentication.

Conventions are stored in the `pr_hawk.conventions` collection and associated with a repository or GitHub installation scope. During a review, the relevant rules are loaded and added to the AI prompt.

This makes the review more specific to a project instead of relying only on generic code-quality rules.

## 5. Pull-request review sequence

```text
1. User installs PRHawk on one or more repositories.
2. GitHub redirects the user to the PRHawk setup page.
3. The setup page asks for a target repository and an optional convention-source repository.
4. The backend checks the installation's accessible repositories before saving the configuration.
5. User opens a pull request or pushes a new commit to an existing PR.
6. GitHub emits a pull_request webhook.
7. Express receives the raw request body.
8. PRHawk validates X-Hub-Signature-256.
9. PRHawk returns HTTP 202 to GitHub.
10. For opened, synchronize, or reopened actions, background processing obtains a GitHub installation token.
11. PR metadata and changed files are fetched.
12. Added lines and file context are extracted.
13. Repository and configured source conventions are loaded from MongoDB.
14. The review prompt is sent to OpenAI.
15. Groq is tried if OpenAI fails.
16. The response is validated and cleaned.
17. PRHawk posts the review to GitHub.
18. For a merged pull request, PRHawk analyzes recent merged PRs for the target and configured source repositories and updates MongoDB.
```

The `202 Accepted` response is important because GitHub expects the webhook receiver to respond quickly. Long-running model calls should not block the webhook acknowledgement.

## 6. Webhook request handling

The webhook endpoint receives the raw request body rather than parsing JSON first. This is required because the signature must be calculated over the exact bytes sent by GitHub.

The request is handled in this order:

```text
Raw body received
      ↓
Signature verified
      ↓
Event type checked
      ↓
Action checked
      ↓
202 response returned
      ↓
Review processing started
```

Events that are not pull-request events, or actions that are not supported, receive an empty success response and are ignored.

## 7. Data flow for one review

```text
GitHub PR event
      │
      ▼
PR URL + head SHA + installation ID
      │
      ▼
GitHub installation token
      │
      ├── PR metadata
      ├── Changed files
      ├── Patches
      └── Current file contents
      │
      ▼
FileContext[]
      │
      ├── Added lines
      ├── Patch text
      └── File content
      │
      ▼
AI review prompt + MongoDB conventions
      │
      ▼
Validated ReviewResult
      │
      ▼
GitHub review comments
```

Large file contents are truncated using `maxFilesContextChars` before being sent to the model. This controls prompt size and cost.

## 8. Security model

### Secrets

The following values stay on the backend:

- GitHub App private key.
- GitHub webhook secret.
- OpenAI API key.
- Groq API key.
- MongoDB connection string.

The frontend receives none of these values.

### GitHub permissions

The App should use the minimum required permissions:

- Contents: Read-only.
- Pull requests: Read and write.
- Metadata: Read-only.

The App should subscribe to the pull-request event only unless more events are required later.

### Webhook protection

Requests without a valid signature receive `401 Unauthorized`. This prevents arbitrary clients from submitting fake pull-request events.

### Repository isolation

Installation access tokens are limited to repositories selected during App installation. Convention data is also scoped by repository or installation identifier.

## 9. Error handling and fallback behavior

| Failure | Behavior |
|---|---|
| Invalid webhook signature | Return `401`; do not process the request |
| Invalid webhook JSON | Return `400` |
| Unsupported GitHub event | Ignore with a successful empty response |
| Missing PR URL or head SHA | Log processing failure |
| GitHub App token failure | Log processing failure; no review is posted |
| MongoDB unavailable | Review may fail when conventions are loaded |
| OpenAI failure | Retry, then try Groq |
| Groq failure | Retry and report a review-processing failure |
| Invalid model JSON | Retry provider; then try fallback provider |
| Comment on invalid line | Remove before publishing |
| GitHub publishing failure | Log the failure for webhook-delivery troubleshooting |

## 10. Local development architecture

For local webhook testing:

```text
Browser ──▶ localhost:5173    React frontend

GitHub ──▶ ngrok HTTPS URL ──▶ localhost:3000    Express backend
```

Commands:

```powershell
# Backend
cd backend
npm.cmd start

# Public HTTPS tunnel
ngrok http 3000

# Frontend
cd frontend
npm.cmd run dev
```

The GitHub App webhook URL must use the public ngrok address:

```text
https://YOUR-NGROK-DOMAIN.ngrok-free.app/api/github/webhook
```

## 11. Production deployment

A production deployment requires:

1. A public HTTPS backend URL.
2. A GitHub App configured with that backend webhook URL.
3. Environment secrets configured in the hosting platform.
4. A MongoDB deployment reachable from the backend.
5. A frontend deployment configured with the GitHub App installation URL.

The production request path is:

```text
GitHub → HTTPS load balancer/host → Express backend → GitHub API
                                      │
                                      ├── MongoDB
                                      └── OpenAI/Groq
```

For higher reliability, the asynchronous review work should eventually move from an in-process promise to a durable queue such as Redis/BullMQ, SQS, or another job system.

## 12. CLI boundary

The CLI is an administrative/developer interface, not part of the normal GitHub App workflow.

Location:

```text
backend/src/cli.ts
```

It can:

- Run a local review for a supplied PR URL.
- Run a dry-run review without publishing.
- Learn conventions from a repository.

The webhook and CLI reuse the same GitHub service, convention store, review engine, and AI provider modules. This avoids duplicating the core review logic. The webhook automatically learns after merged pull requests; the CLI remains a maintainer tool for local workflows.

## 13. Important design decisions

### GitHub App instead of personal access tokens

The GitHub App model provides repository-scoped access, installation-based authorization, and automatic event delivery. Users do not need to create or paste personal tokens.

### Webhooks instead of CI/CD polling

GitHub sends an event as soon as a pull request changes. This avoids polling repositories and makes the system react only when reviewable work happens.

### GitHub as the review interface

Comments are posted where developers already collaborate. This removes the need to build a second review dashboard for the initial product.

### Structured AI output

The model is constrained to a schema, and the backend validates the result before it reaches GitHub. This is safer than trusting free-form model text.

### OpenAI with Groq fallback

The provider abstraction improves availability. A temporary failure from the primary provider does not immediately fail the pull-request review.

## 14. Scalability improvements

The current implementation is suitable for local testing and a small hosted deployment. For larger usage, the next improvements would be:

- Add a durable background job queue.
- Add idempotency using delivery IDs or PR head SHAs.
- Prevent duplicate reviews for repeated webhook deliveries.
- Add rate-limit handling and exponential backoff for GitHub.
- Cache installation tokens until expiry.
- Cache repository conventions with invalidation.
- Add structured logs and request correlation IDs.
- Add metrics for webhook latency, AI latency, and review failures.
- Add an administrator dashboard for installations and delivery status.
- Add automated integration tests using a GitHub App test installation.

## 15. Interview explanation

An effective short explanation is:

> PRHawk is a GitHub App that performs automatic AI code reviews. The React frontend is a public installation page, while the TypeScript Express backend receives signed pull-request webhooks. After validating the webhook, the backend creates a short-lived GitHub installation token, fetches the pull-request diff and file context, loads repository-specific conventions from MongoDB, and sends a structured review request to OpenAI. If OpenAI fails, Groq is used as a fallback. The response is validated with a schema, invalid line comments are removed, and the final summary and inline comments are posted back to GitHub. Secrets remain on the backend, and repository access is limited by the GitHub App installation.

## 16. Repository map

```text
PRHawk/
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── pages/LandingPage.jsx
├── backend/
│   └── src/
│       ├── index.ts
│       ├── cli.ts
│       ├── config.ts
│       ├── github/
│       │   ├── appAuth.ts
│       │   ├── client.ts
│       │   ├── diffParser.ts
│       │   ├── prService.ts
│       │   └── reviewPublishers.ts
│       ├── review/
│       │   ├── prompts.ts
│       │   ├── reviewer.ts
│       │   └── schema.ts
│       ├── conventions/
│       │   ├── learner.ts
│       │   └── store.ts
│       ├── db/index.ts
│       └── llm/groq.ts
├── architecture.md
├── README.md
└── test.md
```
