#!/usr/bin/env bash
# Ralph watchdog — restart the loop if it died silently.
#
# Background: v3 Loop #1 timed out at 20m, finished its analysis phase,
# then stopped without starting Loop #2 (process killed externally —
# reboot / OOM / accidental tmux kill). Without intervention Ralph
# remains down for days while fix_plan still has [ ] items.
#
# This watchdog (run every 5 min via crontab) restarts Ralph iff ALL:
#   - No ralph_loop.sh is currently running for this project
#   - fix_plan.md still has open [ ] items
#   - Circuit breaker is NOT OPEN (don't bypass intentional halts)
#   - Last restart was >10 min ago (cooldown — avoid thrash)
#
# Logs every decision to .ralph/watchdog.log.

set -euo pipefail

PROJECT_DIR="${HOME}/myclaw-aios"
RALPH_DIR="${PROJECT_DIR}/.ralph"
LOG="${RALPH_DIR}/watchdog.log"
COOLDOWN_FILE="${RALPH_DIR}/.watchdog_last_restart"
COOLDOWN_SECS=600   # 10 minutes
RALPH_BIN="${HOME}/.local/bin/ralph"

# Initial guard — required state must exist
if [[ ! -d "${RALPH_DIR}" ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') | abort: ${RALPH_DIR} missing" >> "${LOG}"
  exit 0
fi
if [[ ! -x "${RALPH_BIN}" ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') | abort: ralph binary not executable at ${RALPH_BIN}" >> "${LOG}"
  exit 0
fi

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') | $*" >> "${LOG}"
}

# 1. Is a ralph_loop running with this project's cwd?
RALPH_PIDS=$(pgrep -f "ralph_loop\.sh" 2>/dev/null || true)
RUNNING_HERE=""
for pid in ${RALPH_PIDS}; do
  cwd=$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)
  if [[ "${cwd}" == "${PROJECT_DIR}"* ]]; then
    RUNNING_HERE="${pid}"
    break
  fi
done

if [[ -n "${RUNNING_HERE}" ]]; then
  # Healthy — nothing to do. Log every 30 min only to avoid noise.
  minute=$(date '+%M')
  if [[ "${minute}" == "00" || "${minute}" == "30" ]]; then
    log "alive: ralph_loop pid=${RUNNING_HERE} (skipping restart)"
  fi
  exit 0
fi

# 2. Is there work left?
OPEN_COUNT=$(grep -c '^- \[ \]' "${RALPH_DIR}/fix_plan.md" 2>/dev/null || echo 0)
if [[ "${OPEN_COUNT}" -eq 0 ]]; then
  log "no work: fix_plan has 0 open items — staying down"
  exit 0
fi

# 3. Circuit breaker — don't override an intentional halt.
CB_STATE=$(jq -r '.state // "UNKNOWN"' "${RALPH_DIR}/.circuit_breaker_state" 2>/dev/null || echo UNKNOWN)
if [[ "${CB_STATE}" == "OPEN" ]]; then
  CB_REASON=$(jq -r '.reason // "n/a"' "${RALPH_DIR}/.circuit_breaker_state" 2>/dev/null)
  log "circuit OPEN (${CB_REASON}) — not restarting; user must --reset-circuit"
  exit 0
fi

# 4. Cooldown — don't restart more than once per 10 min.
NOW_TS=$(date +%s)
if [[ -f "${COOLDOWN_FILE}" ]]; then
  LAST=$(cat "${COOLDOWN_FILE}" 2>/dev/null || echo 0)
  ELAPSED=$((NOW_TS - LAST))
  if [[ "${ELAPSED}" -lt "${COOLDOWN_SECS}" ]]; then
    log "cooldown: last restart ${ELAPSED}s ago (need ${COOLDOWN_SECS}s)"
    exit 0
  fi
fi

# 5. All gates clear — restart in detached tmux.
log "RESTART triggered: ${OPEN_COUNT} open items, circuit=${CB_STATE}, cooldown clear"
cd "${PROJECT_DIR}"
echo "${NOW_TS}" > "${COOLDOWN_FILE}"

# Use --monitor to spawn the tmux session; redirect stdout to log so
# the cron mailer doesn't get spammed.
if "${RALPH_BIN}" --monitor >> "${LOG}" 2>&1; then
  log "ralph --monitor launched ok"
else
  log "ralph --monitor exited non-zero (tmux session may still be alive)"
fi
