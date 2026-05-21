# GitHub Actions secrets for `microblue/myclaw-aios`

Status: **awaiting human (DZ)** — `gh secret list --repo
microblue/myclaw-aios` returns empty. The `realmode-e2e-prod` job in
`.github/workflows/ci.yml` references 4 secrets that don't exist yet, so
the job currently silently skips real-mode coverage on every push to
`main`. Setting these closes the gap.

## What the workflow expects

From `.github/workflows/ci.yml` → `realmode-e2e-prod` (lines 82–85):

| GitHub Secret name           | Value source on this machine                              | What it's for                                                                  |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `REAL_TEST_EMAIL`            | `microblue@gmail.com`                                     | The account `helpers/real-session.ts` mints a Supabase session for             |
| `SUPABASE_URL`               | `~/.openclaw/credentials/myclaw-supabase.env:SUPABASE_URL` | Project URL — used by service-role admin API + test row inserts                |
| `SUPABASE_PUB_KEY`           | `~/.openclaw/credentials/myclaw-supabase.env:SUPABASE_PUB_KEY` (alias for `SUPABASE_ANON_KEY`) | Anon key — client-side reads from inside the test                              |
| `SUPABASE_SERVICE_ROLE_KEY`  | `~/.openclaw/credentials/myclaw-supabase.env:SUPABASE_SECRET_KEY` (alias for `SUPABASE_SERVICE_ROLE_KEY`) | Admin API + service-role inserts of seed assistant messages, intents, etc.     |

## What the human needs to do (one-time)

```bash
# Load values into the shell — they're already on disk.
set -a
source ~/.openclaw/credentials/myclaw-supabase.env
set +a

cd ~/myclaw-aios

# Set the four secrets. `gh secret set` reads from stdin so the value
# never lands in shell history or process args.
printf '%s' "microblue@gmail.com"                        | gh secret set REAL_TEST_EMAIL          --repo microblue/myclaw-aios
printf '%s' "$SUPABASE_URL"                              | gh secret set SUPABASE_URL             --repo microblue/myclaw-aios
printf '%s' "${SUPABASE_PUB_KEY:-$SUPABASE_ANON_KEY}"    | gh secret set SUPABASE_PUB_KEY         --repo microblue/myclaw-aios
printf '%s' "${SUPABASE_SERVICE_ROLE_KEY:-$SUPABASE_SECRET_KEY}" | gh secret set SUPABASE_SERVICE_ROLE_KEY --repo microblue/myclaw-aios

# Confirm — should list four entries.
gh secret list --repo microblue/myclaw-aios
```

## Verification

After setting the secrets:

1. Push any small commit (or re-run the latest workflow from the
   Actions tab) and watch the `realmode-e2e-prod` job — it should now
   actually execute instead of being silently skipped.
2. Successful run = the same suite Ralph runs locally
   (`e2e/phase6-realmode-*`, `e2e/phase7-*`, `e2e/phaseL*`) passes against
   `https://myclaw-aios.vercel.app`.

## Notes

- The workflow points `PLAYWRIGHT_BASE_URL` at `https://myclaw-aios.vercel.app`
  (project URL), not `https://app.myclaw.one` (custom domain). Vercel
  aliases both to the same production deployment so the test target is
  effectively identical, but if a future debug session needs the
  canonical custom domain it's a one-line edit in `ci.yml`.
- The four secrets are **not** required by the `typecheck-and-build`
  or `mock-e2e` jobs — those jobs use inline placeholder env values and
  will keep passing whether or not the secrets exist.
- No secret values appear in this doc by design. Reference them by env
  var name + the canonical source path only.

## After it's done

Mark `D4` `[x]` in `.ralph/fix_plan.md` once `gh secret list` shows all
four entries and the next push to `main` produces a green
`realmode-e2e-prod` run.
