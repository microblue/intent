# Hand-off — extend `aios-ui-spec.md` §3.1 with three shipped-but-undocumented routes

**Repo:** `~/myclaw/`
**File:** `docs/aios-ui-spec.md` (symlinked into `myclaw-aios/.ralph/specs/aios-ui-spec.md`)
**Section:** §3.1 Routes (the route table)

## What's wrong

`myclaw-aios` ships three routes that §3.1's table doesn't list. They
are all in active use; none should be removed. The spec is the gap.

## Routes to add

Append the following rows to the §3.1 table:

| Path | Page | Status |
|---|---|---|
| `/auth/signin` | SignIn — email-link sign in + sign up | ✓ |
| `/auth/reset-password` | ResetPassword — password reset confirm | ✓ |
| `/archive` | Archive — list of 封存'd intents + 取消封存 action | ✓ |

## Why each one is legitimate

- **`/auth/signin`** — referenced by `Sidebar.tsx` (the signed-out
  "登录" button and the post-signout redirect from
  `Settings.tsx`'s signout flow). Signed-out users land here.
- **`/auth/reset-password`** — landing target for Supabase password
  reset emails. Required for the reset flow to complete.
- **`/archive`** — surfaced from `IntentList`'s archive action and
  the per-intent archive dropdown. Lay-user-spec rule "archive by
  accident needs exactly one path back" requires a list + restore UI.

## Source-of-truth pointers

- Router: `myclaw-aios/src/router.tsx:93-108` (signInRoute,
  resetPasswordRoute, archiveRoute).
- Components: `src/routes/{SignIn,ResetPassword,Archive}.tsx`.

Once §3.1 is updated and committed in `~/myclaw`, mark
`myclaw-aios/.ralph/fix_plan.md` item **A3** as `[x]` and delete this
hand-off file. Until then it stays in place so the gap is visible.
