# Enabling subagent delegation on a claw

On each OpenClaw-backed claw, `main` (and any other orchestrator) needs
`group:sessions` in its `tools.alsoAllow` so the LLM can call
`sessions_spawn` to delegate sub-tasks to specialist agents.

Without it, you'll see the agent reply "看起来子 agent 当前没有启用" —
the tool isn't registered for the agent's LLM call, so the model falls
back to doing everything itself.

## Quick fix (applied to cool-brook on 2026-05-21)

```bash
ssh ubuntu@<claw-ip>
sudo python3 - <<'PY'
import json
with open('/home/openclaw/.openclaw/openclaw.json') as f:
    d = json.load(f)
for a in d['agents']['list']:
    allow = a.setdefault('tools', {}).setdefault('alsoAllow', [])
    if 'group:sessions' not in allow:
        allow.append('group:sessions')
with open('/home/openclaw/.openclaw/openclaw.json', 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
PY
sudo systemctl restart openclaw-gateway
```

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
