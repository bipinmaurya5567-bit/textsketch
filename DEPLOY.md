# Deploying TextSketch to Render

## Prerequisites

- A [Render](https://render.com) account
- A Gemini API key (from [Google AI Studio](https://aistudio.google.com))
- This repository pushed to GitHub or GitLab

---

## 1. Create a New Web Service

1. In the Render dashboard click **New → Web Service**.
2. Connect your GitHub/GitLab repo.
3. Select the branch you want to deploy (e.g. `master`).

---

## 2. Build & Start Commands

| Setting           | Value                  |
|-------------------|------------------------|
| **Runtime**       | Node                   |
| **Build command** | `npm ci`               |
| **Start command** | `npm start`            |

> `npm ci` performs a clean, reproducible install from `package-lock.json`.  
> `npm start` runs `node server/index.js`.

---

## 3. Environment Variables

Set these in **Environment → Environment Variables** on the Render dashboard.  
**Never commit secret values to source control.**

| Variable          | Required | Example / Notes                                 |
|-------------------|----------|-------------------------------------------------|
| `GEMINI_API_KEY`  | ✅ Yes   | Your Google Gemini API key                      |
| `GEMINI_MODEL`    | No       | Defaults to `gemini-2.0-flash` if not set       |
| `NODE_ENV`        | ✅ Yes   | Set to `production`                             |

---

## 4. Health Check

Render can verify the service is alive before routing traffic.

| Setting              | Value            |
|----------------------|------------------|
| **Health check path**| `/api/health`    |

The endpoint returns HTTP **200** with JSON:

```json
{ "status": "ok", "model": "gemini-2.0-flash", "keyLoaded": true }
```

---

## 5. Notes

- **Port**: The server reads `process.env.PORT` (set automatically by Render) and binds to `0.0.0.0`. No manual port configuration is needed.
- **Proxy / Rate limiting**: The server sets `trust proxy 1` so the per-IP rate limiter sees real client IPs forwarded by Render's proxy via `X-Forwarded-For`.
- **Node version**: `package.json` declares `"engines": { "node": ">=20" }`. Render defaults to a recent LTS; pin to Node 20 in **Settings → Runtime** if you need an exact version.
