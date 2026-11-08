# PRHawk Webhook Test: Persona_Based_AIChatbot

This guide tests the complete GitHub App webhook pipeline for:

```text
https://github.com/aryen1101/Persona_Based_AIChatbot
```

The test creates a pull request, lets GitHub notify PRHawk automatically, and verifies that PRHawk posts a review without a manually entered URL.

## 1. Start PRHawk

Open PowerShell:

```powershell
cd C:\Users\aryen\OneDrive\Documents\Desktop\Learning\PRHawk\backend
npm.cmd start
```

Expected output:

```text
Code Review Copilot running on http://localhost:3000
```

The frontend is not required for webhook testing.

## 2. Expose the backend over HTTPS

GitHub cannot send webhooks to `localhost`. Start an HTTPS tunnel:

```powershell
ngrok http 3000
```

If ngrok gives you:

```text
https://abc123.ngrok-free.app
```

Your webhook URL is:

```text
https://abc123.ngrok-free.app/api/github/webhook
```

Keep ngrok running during the entire test.

Verify that the public backend is reachable:

```powershell
Invoke-WebRequest -UseBasicParsing https://abc123.ngrok-free.app/api/health
```

The response should be JSON containing `"ok":true`. If it returns `404`, the backend is not the process listening on port `3000`.

## 3. Create the GitHub App

1. On GitHub, click your profile picture and open **Settings**.
2. Open **Developer settings → GitHub Apps**.
3. Click **New GitHub App**.
4. App name: `PRHawk Webhook Tester`.
5. Homepage URL:

   ```text
   https://github.com/aryen1101/PRHawk
   ```

6. Enable **Active** under **Webhooks**.
7. Webhook URL:

   ```text
   https://abc123.ngrok-free.app/api/github/webhook
   ```

8. Create a random webhook secret and save it temporarily.
9. Set repository permissions:
   - **Contents:** Read-only
   - **Pull requests:** Read and write
   - **Metadata:** Read-only
10. Subscribe to the **Pull request** event.
11. Select **Only on this account** for installation.
12. Click **Create GitHub App**.

Set the App **Setup URL** to your frontend setup route:

```text
https://YOUR_FRONTEND_HOST/setup
```

After installation, GitHub redirects the installer to this page. The user selects the target repository and may optionally enter a convention-source repository. PRHawk warns and refuses to save the source if the App is not installed there.

See GitHub's [GitHub App quickstart](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/quickstart) for the official flow.

## 4. Download the App private key

On the new App's settings page:

1. Copy the numeric **App ID**.
2. Find **Private keys** or **Credentials → Key pairs**.
3. Click **Generate a private key** or **New key**.
4. Save the downloaded `.pem` file securely.

GitHub does not store the private key for later download. Never commit or share this file. See [GitHub private-key guidance](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).

## 5. Install the App on the test repository

1. On the App settings page, click **Public page** or **Install App**.
2. Choose the `aryen1101` account.
3. Select **Only select repositories**.
4. Select:

   ```text
   Persona_Based_AIChatbot
   ```

5. Click **Install**.

The App must be installed on this exact repository to receive its pull request events.

## 6. Configure `backend/.env.local`

Edit:

```text
C:\Users\aryen\OneDrive\Documents\Desktop\Learning\PRHawk\backend\.env.local
```

Add the App settings:

```env
GITHUB_APP_ID=your_numeric_app_id
GITHUB_WEBHOOK_SECRET=the_same_secret_used_in_github
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nPASTE_KEY_CONTENT_HERE\n-----END PRIVATE KEY-----"
```

Keep the PEM key on one line and use literal `\n` characters between lines. PRHawk converts them back to newlines.

Keep your existing AI and MongoDB settings:

```env
MONGODB_URL=your_mongodb_connection
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.betterrate.staging.scalerailabs.com/v1
OPENAI_MODEL=gpt-6-astra
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
```

OpenAI is tried first and Groq is used as the fallback. A GitHub PAT is not required when the App credentials are configured.

Restart the backend after editing `.env.local`:

```powershell
cd C:\Users\aryen\OneDrive\Documents\Desktop\Learning\PRHawk\backend
npm.cmd start
```

## 7. Create a test pull request

Use the exact test repository:

```powershell
git clone https://github.com/aryen1101/Persona_Based_AIChatbot.git
cd Persona_Based_AIChatbot
git checkout -b prhawk-webhook-test
```

Create a small change:

```powershell
Set-Content -Path prhawk-webhook-test.js -Value @'
function getUserName(user) {
  return user.profile.name;
}
'@
git add prhawk-webhook-test.js
git commit -m "Test PRHawk webhook review"
git push -u origin prhawk-webhook-test
```

Open GitHub and create a pull request from `prhawk-webhook-test` into the default branch.

Do not paste the PR URL into PRHawk.

## 8. Verify automatic review

Expected flow:

```text
PR opened
  → GitHub sends pull_request webhook
  → PRHawk verifies the signature
  → PRHawk creates an App installation token
  → PRHawk fetches the PR and changed files
  → PRHawk loads repository conventions from MongoDB
  → OpenAI reviews the change
  → Groq is used if OpenAI fails
  → PRHawk posts the GitHub review
```

Check the backend terminal for the review log. Then open the pull request and confirm that it contains:

- A review summary
- A quality score
- A merge recommendation
- Inline comments when findings are detected

## 9. Verify PR updates

Push another commit to the same branch:

```powershell
Add-Content -Path prhawk-webhook-test.js -Value "`nconsole.log(getUserName({ profile: { name: 'Test' } }));"
git add .
git commit -m "Update webhook test change"
git push
```

The `synchronize` event should trigger another review automatically.

## 10. Verify automatic convention learning

Merge the test pull request after reviewing its comments. GitHub will send a `pull_request` event with:

```text
action = closed
pull_request.merged = true
```

PRHawk should accept the webhook and learn conventions from the repository's recent merged pull requests. Check the backend terminal for:

```text
Learned N convention(s) from merged pull requests for aryen1101/Persona_Based_AIChatbot.
```

The learned rules are saved in MongoDB and are automatically loaded into future pull-request reviews. No CLI command is required.

## 11. Test webhook security

This request has no valid GitHub signature and should return `401`:

```powershell
try {
  Invoke-WebRequest -Method Post `
    -Uri https://abc123.ngrok-free.app/api/github/webhook `
    -ContentType "application/json" `
    -Body '{}'
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected result:

```text
401
```

## 12. Troubleshooting

Check the App's **Advanced → Recent Deliveries** page:

- No delivery: the App is not installed on `Persona_Based_AIChatbot`, or the Pull request event is disabled.
- `401`: the webhook secret does not match `GITHUB_WEBHOOK_SECRET`.
- `404`: the tunnel URL or `/api/github/webhook` path is wrong.
- Review or convention learning fails: check MongoDB, OpenAI, and Groq environment variables.
- Review cannot post: verify Pull requests permission is **Read and write**.

## 13. Final checklist

- [ ] Backend runs on port `3000`.
- [ ] HTTPS tunnel is running.
- [ ] Webhook URL ends with `/api/github/webhook`.
- [ ] Webhook secret matches the local environment.
- [ ] App is installed on `Persona_Based_AIChatbot`.
- [ ] Pull request event is enabled.
- [ ] App private key is configured with escaped `\n` characters.
- [ ] MongoDB and AI keys are configured.
- [ ] Review appears without entering a PR URL.
- [ ] A new commit triggers another review.
- [ ] Merging a PR triggers automatic convention learning.

## Security

Never commit `backend/.env`, `backend/.env.local`, the App `.pem` file, webhook secret, API keys, or MongoDB password. Rotate any credential that is exposed.
