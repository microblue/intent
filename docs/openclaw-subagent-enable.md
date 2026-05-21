# Enabling subagent delegation on a claw

To make `main` actually delegate to specialist agents (`planner`,
`writer`, `flights`, …) two separate gates must be opened in
`openclaw.json`:

1. **Tool group allowlist** — `group:sessions` in each agent's
   `tools.alsoAllow` so `sessions_spawn` is callable.
2. **Agent-to-agent routing policy** — `tools.agentToAgent.enabled =
   true` so the runtime accepts calls where the requester agent
   differs from the target agent. Default is `false` → main can only
   spawn another `main` no matter what `agentId` it tries.

Without (1) you'll see "看起来子 agent 当前没有启用".
Without (2) you'll see "目前的子 agent 白名单里只能 spawn main".

The LLM also needs explicit instruction in `main`'s AGENTS.md about
how to call sessions_spawn with the right `agentId`, or it will spawn
without and just spin up another main.

## Quick fix (applied to cool-brook on 2026-05-21)

```bash
ssh ubuntu@<claw-ip>
sudo python3 - <<'PY'
import json
with open('/home/openclaw/.openclaw/openclaw.json') as f:
    d = json.load(f)
# Gate 1: per-agent tool allowlist
for a in d['agents']['list']:
    allow = a.setdefault('tools', {}).setdefault('alsoAllow', [])
    if 'group:sessions' not in allow:
        allow.append('group:sessions')
# Gate 2: agent-to-agent routing policy
d.setdefault('tools', {})['agentToAgent'] = {
    'enabled': True,
    'allow': ['*'],
}
with open('/home/openclaw/.openclaw/openclaw.json', 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
PY
sudo systemctl restart openclaw-gateway
```

Also: each orchestrator agent's `AGENTS.md` must list the available
sub-agent IDs and instruct the LLM to pass `agentId` explicitly to
`sessions_spawn`. See `/home/openclaw/.openclaw/agents/main/agent/AGENTS.md`
on cool-brook for the working template.

## Verification

```bash
# Probe via the gateway WS — see if main calls sessions_spawn
# (see /tmp/probe-orchestrate.mjs on the dev box)
```

Expected: tool-call event `{"name":"sessions_spawn","args":{"task":"...","agentId":"planner"}}`
then a normal `chat` final from main saying "已经交给规划员…".

## Permanent fix (TBD — installer template)

Future claws need this baked into `cloud-scripts/install-claw.sh`'s
`CONFIG_JSON_B64` template. The current installer doesn't include
`group:sessions` in the per-agent allowlist — that's the bug.
