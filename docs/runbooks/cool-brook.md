# cool-brook (pilot OpenClaw VM) runbook

Read this only when a task explicitly touches the gateway VM, agent
personas, Caddy, or OpenClaw config. Most loops do not need it.

## SSH

```bash
ssh -i ~/.ssh/lightsail/LightsailDefault.pem -o StrictHostKeyChecking=no \
    ubuntu@54.218.209.8
```

## OpenClaw

```bash
sudo cat /home/openclaw/.openclaw/openclaw.json
sudo systemctl restart openclaw-gateway
sudo journalctl -u openclaw-gateway -n 100 --no-pager
```

Two-gate subagent enable: each agent's `tools.alsoAllow` must include
`group:sessions` AND `tools.agentToAgent.enabled = true`.

## Agent persona files

```bash
sudo ls /home/openclaw/.openclaw/agents/<agentId>/agent/
# IDENTITY.md, SOUL.md, AGENTS.md per agent
```

## Caddy reverse proxy

```bash
sudo cat /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The `/ws` upstream maps to `127.0.0.1:8080` (OpenClaw gateway).
