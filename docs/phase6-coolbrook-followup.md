# Phase 6 — cool-brook Caddyfile follow-up

You ran the original `phase6-coolbrook-prompt.md` against cool-brook
(IP `54.218.209.8`, subdomain `96tdd65c.myclaw.one`). aios just probed
the result and found the `/ws` path is still being served by Next.js,
not OpenClaw:

```
$ curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
       -H "Sec-WebSocket-Version: 13" \
       -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
       https://96tdd65c.myclaw.one/ws

HTTP/2 307
via: 1.1 Caddy           ← Caddy is in front
x-powered-by: Next.js    ← but routed to Next.js, NOT openclaw:18789
location: /
```

The aios SPA can't open a real WebSocket against cool-brook until this
is fixed. Everything else (myclaw `mint-claw-token`, aios WS client,
ClawStatus indicator) is in place and waiting on this single hop.

## Diagnosis

The cool-brook Caddyfile likely has the `/ws` reverse-proxy block, but
its matcher is placed **after** a default `reverse_proxy` to the
Next.js operator studio. Caddy applies directives in source order
inside a site block — the first matching `reverse_proxy` wins, so the
default catches everything before `@ws` is consulted.

## What to do

SSH to cool-brook (`54.218.209.8`) — you got in last time, same method
works (try `ssh root@54.218.209.8` then password, or use Lightsail
browser-based SSH from the AWS console).

1. Print the current Caddyfile entry for `96tdd65c.myclaw.one`:

   ```bash
   sudo cat /etc/caddy/Caddyfile | sed -n '/96tdd65c/,/^}/p'
   ```

   (Or `grep -nA 40 '96tdd65c' /etc/caddy/Caddyfile` — whichever shows
   the whole site block.)

2. Make sure `@ws` is matched and reverse-proxied **before** any
   default reverse_proxy / route directive in the same block. The
   minimal correct shape:

   ```caddyfile
   96tdd65c.myclaw.one {
       @ws path /ws
       reverse_proxy @ws localhost:18789

       # ─── default: Next.js studio ──────
       reverse_proxy localhost:3000   # or whatever port studio runs on
   }
   ```

   If the existing block uses `handle` / `handle_path` / `route`
   wrappers, the `/ws` handler still needs to come first in source
   order, OR be inside a `handle /ws` block (which has higher
   specificity than a bare `handle` catch-all).

3. Validate + reload:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo caddy reload --config /etc/caddy/Caddyfile
   ```

4. Confirm OpenClaw is listening on 18789:

   ```bash
   sudo ss -lntp | grep 18789
   # or
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18789/health \
        2>/dev/null || systemctl status openclaw --no-pager | head
   ```

5. Reprobe from your local box (NOT on cool-brook) — exit value should
   be `101 Switching Protocols`, not `307`:

   ```bash
   curl -i -N \
     -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
     https://96tdd65c.myclaw.one/ws
   ```

## Report back with

- The exact 96tdd65c block from the Caddyfile after your fix.
- The reload command's exit code.
- The reprobe status line — must be `HTTP/2 101` or `HTTP/1.1 101`.

Once that lands, aios can drive end-to-end: sign in → real claw → see
"已连上 claw" status indicator → exchange `connect` frames over the
live WS.
