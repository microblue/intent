# Sentry provisioning for app.myclaw.one

Status: **awaiting human (DZ)** — there is no Sentry account on file for
this org. Code is wired (D3); flipping the switch is a one-line env var.

## What the SPA does today

`src/lib/sentry.ts:initSentry()` is called from `src/main.tsx` on every
load. It is a **no-op** unless:

1. The bundle is a production build (`import.meta.env.PROD === true`).
2. `VITE_SENTRY_DSN` is set and non-empty.

Both conditions guard against accidentally pulling local dev errors into
the Sentry project. The init is intentionally minimal — error capture
only, no perf tracing, no session replay (`tracesSampleRate: 0`,
`replaysSessionSampleRate: 0`). Turn those on per-feature later if
needed; they cost both bundle bytes and Sentry events.

`beforeSend` drops Supabase `AuthSessionMissingError` because that
surfaces during normal sign-out flow and would be noise.

The dev-only test-throw button at `/settings/engines` ("🧨 抛一个测试错")
fires `throwTestError()` from `lib/sentry.ts`. In dev it just lands in
the console; in prod with a DSN configured it would round-trip to
Sentry.

## What the human needs to do (one-time)

1. **Create the Sentry account / org** if there isn't one yet — DZ's
   choice of project owner. Free tier is fine for our error volume.
2. **Create a project** named `myclaw-aios`, platform `React`. Sentry
   will print a DSN that looks like
   `https://<public_key>@<org>.ingest.sentry.io/<project_id>`.
3. **Add the DSN to Vercel** under the `myclaw-aios` project:

   ```bash
   vercel env add VITE_SENTRY_DSN production
   # paste the DSN value when prompted
   ```

   Confirm with `vercel env ls | grep SENTRY` — should show
   `VITE_SENTRY_DSN  Encrypted  production`.
4. **Redeploy prod** to pick up the new env var:

   ```bash
   vercel deploy --prod --token "$VERCEL_TOKEN" --yes --non-interactive
   ```

5. **Verify** by opening `https://app.myclaw.one/settings/engines` in a
   browser. The dev-only test-throw button **will not be visible** in
   prod (correct — it's gated on `env.isDev`). To verify, instead:
   - flip `env.isDev` temporarily, redeploy preview, click the button,
     confirm an issue appears in the Sentry project, then revert; **or**
   - just trust it and wait for the first real error to land. Easier.

## Source paths

- `src/lib/sentry.ts` — `initSentry()` + `throwTestError()`
- `src/lib/env.ts` — `env.sentryDsn` (defaults to `''`)
- `src/main.tsx` — calls `initSentry()` before `createRoot`
- `src/routes/Engines.tsx` — dev-only test button

## After it's done

Mark `D3` `[x]` in `.ralph/fix_plan.md` once the DSN is in Vercel + the
prod deploy has gone out with the env var.
