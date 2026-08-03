# لُقْمَة (Luqma)

A small family trial app: photograph a meal, get a real Claude vision nutrition estimate + a direct actionable tip, log it over a few days, then get an overall dietary reflection. Entirely static frontend + two Vercel serverless functions — no framework, no build step, no local Node/npm required.

## Deploy

1. Push this repo to GitHub.
2. Import the repo into [Vercel](https://vercel.com/new) — no configuration needed, it auto-detects the static files + `/api/*.js` functions.
3. In the Vercel project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your Anthropic API key (Production + Preview)
4. Deploy. Vercel gives you a `*.vercel.app` URL — open it on a phone.

## Usage stats (optional)

To see how many distinct people tried the app and how many came back on
another day (no photos, no personal data — just an anonymous per-device
counter), add a tiny Redis store and a private stats page:

1. In your Vercel project, go to **Storage** → **Marketplace** → find **Upstash**
   → create a Redis database (free tier is plenty) → connect it to this project.
   Vercel will inject the connection env vars automatically.
2. In **Settings → Environment Variables**, add one more of your own:
   - `STATS_SECRET` = any private string you make up (this is your password
     for the stats page — don't share it)
3. Redeploy. Then visit `https://<your-project>.vercel.app/api/stats?key=<your STATS_SECRET>`
   to see the numbers. Bookmark that URL (with your key) for easy checking.

If you skip this step entirely, the app works exactly the same — it just
won't count anything.

## Verify the backend independently (before testing on a phone)

```bash
python -c "import base64; print(base64.b64encode(open('sample.jpg','rb').read()).decode())" > b64.txt
```

Then POST a JSON body like `{"image": "<contents of b64.txt>", "mediaType": "image/jpeg"}` to `https://<your-project>.vercel.app/api/analyze` with `curl` and confirm you get back `{"ok": true, ...}`.

## Notes

- No accounts, no meal database on the server — meals are stored in the browser's IndexedDB, per device. The only thing that ever reaches the server is an anonymous random device id, used solely for the usage-count stats above.
- Photos are sent to Anthropic for analysis but never stored on the server.
- Add to Home Screen: iPhone (Safari) → Share → "إضافة إلى الشاشة الرئيسية". Android (Chrome) → often shows an automatic install prompt, or use the browser menu → "تثبيت التطبيق".
