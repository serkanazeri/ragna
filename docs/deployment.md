# Deployment runbook

## Cloudflare

Use your own Cloudflare account. Wrangler OAuth or a narrowly scoped deployment API token is required. Provisioning creates resources named `ragna` and `ragna-sources`; inspect existing resources first if those names already exist in your account.

```bash
npm ci
npx wrangler login
CLOUDFLARE_ACCOUNT_ID=your-account-id npm run cloud:provision
npx wrangler d1 migrations apply ragna --remote --config wrangler.production.json
npm run deploy
```

Copy the actual deployment URL from Wrangler. Set `vars.SITE_URL` in the ignored `wrangler.production.json` to that URL. `scripts/provision.ts` accepts `RAGNA_URL` for repeatable provisioning. Do not assume another account uses the author's workers.dev subdomain.

```bash
npm run secrets:init
# Add OPENROUTER_API_KEY to .dev.vars using your editor.
npm run secrets:deploy
RAGNA_URL=https://your-worker.workers.dev npm run cloud:index
RAGNA_URL=https://your-worker.workers.dev npm run test:smoke
RAGNA_URL=https://your-worker.workers.dev npm run evaluate:retrieval
RAGNA_URL=https://your-worker.workers.dev npm run evaluate:live
```

`secrets:deploy` sends only named server credentials to Wrangler through stdin. It does not print values. `WEBUI_SECRET_KEY` remains local. Keep `.dev.vars` permissions restricted. Never put secrets in `vars`, a frontend environment variable, or a GitHub issue.

## Checks

`GET /api/status` reports configured providers, corpus version/hash, and index readiness. A configured flag is not a provider health check. Send a question and inspect its mode/spans to verify actual inference. A `live` response with the expected model is evidence of that request only.

The demo's budget is a conservative application limit, not an invoice forecast or hard account-wide billing cap. Administrative indexing and evaluation invoke embeddings independently of the public generation reservation. Run them intentionally. Free quota exhaustion can affect requests even while the application reservation remains available.

Optional Turnstile protection requires both `TURNSTILE_SECRET_KEY` and matching `TURNSTILE_SITE_KEY`/`SITE_URL`. The server verifies hostname. Check accessibility and token renewal before enabling it publicly. The base release uses per-IP and global budget limits.

## Failure investigation

1. Inspect response mode, fallback reason, and spans in the workbench.
2. Check `wrangler tail ragna` for server errors; do not publish logs containing credentials or visitor data.
3. Check D1 migrations and the stored corpus hash.
4. Check Vectorize ingestion completion and metadata indexes for `audience`/`status`.
5. Check model quota and OpenRouter credits/key validity. Do not change models silently to make a health indicator green.

## Rollback

Keep the last known working Git commit and Wrangler deployment version. Use `npx wrangler rollback` for Worker/assets rollback. Database changes need their own forward repair migration; Worker rollback does not reverse D1 data. Reindex the matching corpus before enabling hybrid retrieval after a corpus rollback.

## GitHub CI

The verification workflow builds, tests, and regenerates the offline evaluation without provider secrets. Deployment is manual because deployment credentials should not be available to arbitrary pull-request code. Pin and review dependency updates through the lockfile. Live evaluation is an explicit operator action with a cost boundary.
