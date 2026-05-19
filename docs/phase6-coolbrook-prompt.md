# Phase 6 — Hand-off to cool-brook (Caddyfile `/ws` reverse-proxy)

For a Claude Code session with SSH access to cool-brook (DZ's pilot
claw VM), OR run the steps manually if you prefer.

---

## Context

`~/myclaw-aios` (the AIOS SPA at `app.myclaw.one`) will connect to
per-user claws over WebSocket at:

```
wss://<claw.subdomain>.myclaw.one/ws
```

For cool-brook specifically:

```
wss://96tdd65c.myclaw.one/ws
```

OpenClaw listens on `ws://localhost:18789` on the claw host. We need
Caddy to terminate TLS at the public hostname and reverse-proxy `/ws`
to that local port, preserving the WebSocket upgrade.

Until this lands, the SPA can only run against `ws://localhost:18789`
(desktop shell) — no cloud claw is reachable from a browser.

## Deliverable

Edit `/etc/caddy/Caddyfile` on cool-brook to add a `/ws` matcher under
the existing `*.myclaw.one` block (or wherever cool-brook's hostname
is served). Minimal config:

```caddyfile
96tdd65c.myclaw.one {
    @ws path /ws
    reverse_proxy @ws localhost:18789

    # … rest of the existing block (HTTP routes, etc.) …
}
```

If on-demand TLS is configured for the `*.myclaw.one` wildcard, the
new block inherits cert provisioning automatically. If not, ensure
the wildcard or per-host cert exists before reloading.

Reload Caddy:

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

## Verification

From your laptop (NOT on cool-brook):

```bash
# Probe HTTP upgrade
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  https://96tdd65c.myclaw.one/ws
```

Expect `HTTP/1.1 101 Switching Protocols` (or `HTTP/2 200` followed by
upgrade; depends on Caddy's HTTP/2 negotiation). If it returns 404 or
502, the matcher didn't bind or OpenClaw isn't running on 18789 — check
`systemctl status openclaw` (or whatever supervises it).

A successful upgrade should be followed by an event frame on the wire:

```json
{"type":"event","event":"connect.challenge"}
```

You won't see this from `curl` alone (it needs proper WS framing), but
the 101 is enough for now. Full end-to-end will be verified from aios
once the myclaw Edge Function lands and aios's WS client ships.

## Once verified

Report back with:

- Diff of the Caddyfile change.
- Output of the curl probe (status line is enough).
- Confirmation that the SSH tunnel previously used in dev workflow can
  be retired (`ssh -L 18789:localhost:18789 cool-brook` flows can now
  go through `wss://...`).

## Out of scope

- Rate limiting / WS-level auth (OpenClaw enforces `connect.auth.token`
  inside the frame, so Caddy can stay dumb).
- Per-claw isolation (only one OpenClaw process per claw; reverse
  proxy to its single local port).
- Standard claw image config — once cool-brook works, fold the same
  block into the per-claw provisioning template.
