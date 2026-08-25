# Mickofy Writing Assistant — MVP v0.1

A small desktop writing assistant for improving English communication while keeping you in control of the final message.

## Workflow

1. Highlight text in Gmail, Upwork, Slack, Shopify Admin, a browser, or another app.
2. Copy it with `Ctrl + C`.
3. Press `Ctrl + Shift + G`.
4. The assistant opens with your clipboard text.
5. Choose: Fix Grammar, Make Clearer, Client Reply, Technical, Shorten, or Keep My Voice.
6. Click **Improve**.
7. Review and edit the suggestion yourself.
8. Click **Copy & Close**.
9. Paste it back with `Ctrl + V`.

This version does not monitor all of your keystrokes.

## Requirements

- Node.js 20+ recommended
- npm
- OpenAI API key
- Internet connection

## Install

```bash
npm install
```

## Configure

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```env
OPENAI_API_KEY=your_real_api_key_here
OPENAI_MODEL=gpt-5.6-luna
```

Never commit `.env` to Git.

## Run

```bash
npm start
```

The window starts hidden. Copy a sentence and press `Ctrl + Shift + G`.

## Keyboard

- `Ctrl + Shift + G` — open and load clipboard
- `Ctrl + Enter` — improve
- `Esc` — hide

## Privacy

- No continuous keystroke logging.
- Text is sent only when you click **Improve**.
- The API key stays in the local `.env` file and is not exposed to the renderer UI.
- You review the result before sending it.

## Git

After the app runs:

```bash
git init
git add .
git commit -m "Initialize writing assistant MVP"
```

## Next

v0.2: personal tone settings, before/after diff, explain corrections, local history.

v0.3: one-step selected-text capture, replace selected text after approval, tray behavior, start with Windows.

v0.4: browser extension and optional local AI.
