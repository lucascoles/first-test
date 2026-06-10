# Deploying the XYON Reddit Radar

The Radar is a small always-on Node service: it serves the dashboard, runs an
auto-scan every 2 days (in-process cron), and stores results in SQLite. That
means the host needs to (a) keep the process running and (b) give it a little
persistent storage. Truly-free tiers usually sleep when idle (which stops the
scan) and wipe the filesystem on redeploy — so plan on a small always-on
instance (a couple of dollars a month) for unattended scanning.

You only ever paste two-to-three secrets into the host's dashboard:
`REDDIT_SCAN_CLIENT_ID`, `REDDIT_SCAN_SECRET`, `REDDIT_USER_AGENT`, and
optionally `ANTHROPIC_API_KEY`. See the README/`.env.example` for what each is.

---

## Option A — Railway (simplest for always-on + storage)

1. Go to **https://railway.app** → sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `lucascoles/first-test`.
   Railway auto-detects Node and runs `npm install` + `npm start`.
3. In the service, open **Settings → Branch** and set it to
   `claude/jolly-ramanujan-wvhnjj` (or merge that branch to `main` first).
4. Add a **Volume**: service → **Variables/Volumes → New Volume**, mount path
   `/var/data`. Then add a variable `DB_PATH=/var/data/xyon.db` so the database
   lives on the volume and survives redeploys.
5. Add your variables (service → **Variables**):
   - `REDDIT_SCAN_CLIENT_ID` = your Reddit script-app client ID
   - `REDDIT_SCAN_SECRET` = your Reddit script-app secret
   - `REDDIT_USER_AGENT` = `xyon-listener/1.0 by u/yourusername`
   - `ANTHROPIC_API_KEY` = your Anthropic key (optional)
6. Railway gives the service a public URL. Open **`<that-url>/reddit`** and
   click **Scan now**.

## Option B — Render (Blueprint, one click from `render.yaml`)

1. Go to **https://render.com** → sign in with GitHub.
2. **New + → Blueprint →** pick `lucascoles/first-test` (branch
   `claude/jolly-ramanujan-wvhnjj`). Render reads `render.yaml` and proposes the
   service + a 1 GB disk.
3. It prompts for the secret env vars (`REDDIT_SCAN_*`, `REDDIT_USER_AGENT`,
   `ANTHROPIC_API_KEY`). Paste them and **Apply**.
4. When the deploy finishes, open **`<service-url>/reddit`** → **Scan now**.

> The blueprint uses the `starter` plan because the persistent disk and the
> in-process scheduler need an always-on instance. You can drop to free to try
> it, but remove the `disk:` block first (free has no disk) and expect the
> service to sleep when idle.

## Option C — Any VPS / Fly.io (Docker)

A `Dockerfile` is included.

```bash
docker build -t xyon-radar .
docker run -d --name xyon-radar -p 3000:3000 \
  -v xyon_data:/var/data \
  -e DB_PATH=/var/data/xyon.db \
  -e REDDIT_SCAN_CLIENT_ID=... \
  -e REDDIT_SCAN_SECRET=... \
  -e REDDIT_USER_AGENT='xyon-listener/1.0 by u/yourusername' \
  -e ANTHROPIC_API_KEY=... \
  xyon-radar
```

Then reverse-proxy `:3000` behind your domain and open `/reddit`.

---

## After it's live

- The dashboard auto-rescans every 2 days; hit **Scan now** anytime.
- No keys set? The dashboard still loads (empty) and won't crash.
- Anthropic key unset? Scanning works; the **Draft reply** button just reports
  drafts are disabled.
