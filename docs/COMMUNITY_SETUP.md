# Independent community setup (Windows + Cloudflare)

Clarity has two separate components: the Electron desktop app and a Cloudflare Worker that calls the OpenAI API. **The published source does not give anyone access to the original developer's backend or subscription.** Each user needs their own Cloudflare account, OpenAI API account and key, and a fresh app authentication token.

## Requirements

- Windows 10/11 x64, PowerShell, Node.js and npm.
- A Cloudflare account with access to deploy Workers.
- An OpenAI API key, used **only in the Worker**. API usage may incur charges.
- The desktop application source or an unsigned build from [Community CI](../.github/workflows/community-ci.yml).

## 1. Set up a separate Worker

From `cloudflare/mickofy-writing-assistant`, run:

```powershell
npm ci
npx wrangler login
```

Before deploying, change `name` in your local `wrangler.jsonc` to a **unique Worker name** you control, e.g. `yourname-clarity-worker`. Deploy only to your own Cloudflare account; don't connect CI to the author's Cloudflare deployment. The repo's `wrangler.jsonc` is a sample with an existing project name, not credentials.

Set the backend secrets for **your Worker**:

```powershell
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WRITING_APP_TOKEN
```

Enter your own OpenAI API key when prompted for `OPENAI_API_KEY`. For `WRITING_APP_TOKEN`, use a unique high-entropy random token (not your API key); keep its value for your desktop configuration. Wrangler's prompts accept secret values without putting them on the command line or in Git history.

Deploy your Worker and note its `https://...` URL:

```powershell
npm run deploy
```

The configured Worker name is separate per Cloudflare account. Review deployment and billing implications before using your own API key. For local Worker development, `.dev.vars.example` illustrates the required bindings. Never commit a populated `.dev.vars` file.

## 2. Configure the desktop app

Clarity currently reads the desktop connection settings from **process environment variables**, not from `.env` files automatically. Do not set `OPENAI_API_KEY` on the desktop.

In PowerShell, for a source checkout:

```powershell
$env:WRITING_API_URL = "https://your-worker.your-account.workers.dev"
$env:WRITING_APP_TOKEN = "your-own-worker-application-token"
npm ci
npm start
```

Use the exact deployed URL from Wrangler. The token must match the Worker secret. These commands only set values for the current PowerShell process and its child processes.

For an installed Windows app launched from Start Menu, configure `WRITING_API_URL` and `WRITING_APP_TOKEN` as **user-scoped environment variables** in Windows, then restart the app and your shell/session as needed. Environment variables and logs can be readable to processes running under the same user account; avoid shared machines and rotate exposed tokens. Do not put them in a committed file or an installer.

The Worker performs authenticated AI requests using its own secrets. The desktop app does not require the provider API key.

## 3. Checks and troubleshooting

- If Clarity says `WRITING_API_URL is not configured`, the app process did not receive that setting.
- If Clarity says `WRITING_APP_TOKEN is not configured`, ensure the app process inherited the token.
- A 401/403 response typically means your desktop token does not match your Worker token; verify both privately.
- Confirm any errors using your own Cloudflare logs. Do not paste secrets, full customer text, or private conversation content into GitHub issues.
- Keep provider keys backend-side, configure appropriate Cloudflare account access controls and billing alerts, and avoid connecting public demos to a live unrestricted API account.
- Running source tests does not exercise your actual OpenAI API or Cloudflare deployment.

## 4. Build your own installer

In the repository root on Windows:

```powershell
npm ci
npm run build
```

The output under `dist/` is an unsigned NSIS installer. GitHub CI also uploads an installer artifact (no automatic deployment). Builds do not embed your application token or OpenAI API key.

## Security notes

The application uses a shared Worker application token. Anyone who obtains it may be able to make requests against your Worker subject to backend controls and your OpenAI API billing. Treat the token as sensitive, never ship it embedded into a public binary, rotate it if exposed, and consider additional authentication/rate limiting before distributing a public multi-user service.

The committed Worker config preserves its original example name to avoid changing an existing developer's deployment. Set your unique Worker name in a **local uncommitted config** when adapting the project.
