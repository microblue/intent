import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BUILTIN_AGENTS } from '@/lib/agents';
import { cn } from '@/lib/cn';

/**
 * AgentPicker — small inline button + popover that lets the user
 * choose which specialist should handle the NEXT message.
 *
 * Architecture note: selecting a specialist does NOT create a new
 * chat session. The session is always `agent:main:aios:<intentId>`,
 * owned by the main orchestrator. Picking a specialist turns the
 * selection into a delegation hint prepended to the user's message
 * (`[委托：请让 … 处理以下问题]`). The orchestrator reads the hint and
 * routes to the specialist via sessions_spawn internally.
 *
 * This means the conversation history is always in one place — the
 * specialist inherits everything the main agent knows, so there is
 * no context loss when the user switches mid-thread.
 *
 * The picker only lists members of the current intent's team
 * (intent_agents rows). Adding a NEW specialist is a separate action
 * via the "+ 加助手" CTA on TeamPanel.
 *
 * The popover is portal-rendered to <body> so it escapes the
 * composer's sticky positioning + z-index stacking context.
 */

export function AgentPicker({
  activeAgentId,
  onChange,
  disabled = false,
  team,
}: {
  activeAgentId: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
  /**
   * Optional set of agentKeys the intent's team currently includes.
   * When provided, the picker shows ONLY these agents. When omitted
   * (e.g. surfaces outside an intent), falls back to the full
   * BUILTIN_AGENTS catalog so the picker stays useful.
   */
  team?: string[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  // Position the portaled menu just above the trigger.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const updatePos = () => {
      const t = triggerRef.current;
      if (!t) return;
      const rect = t.getBoundingClientRect();
      setPos({
        left: rect.left,
        // window.innerHeight - rect.top puts the menu BOTTOM aligned
        // with the trigger top — so the menu opens upward.
        bottom: window.innerHeight - rect.top + 6,
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Filter to team members when a team was provided. Always include
  // `main` if it isn't listed — the seed trigger guarantees `main`
  // exists for every intent on the DB side, so this is a safety net
  // for the first render where Realtime hasn't echoed yet.
  const teamSet = team ? new Set(team.length === 0 ? ['main'] : team) : null;
  const visibleAgents = teamSet
    ? BUILTIN_AGENTS.filter((a) => teamSet.has(a.id))
    : BUILTIN_AGENTS;
  const active =
    visibleAgents.find((a) => a.id === activeAgentId) ?? visibleAgents[0] ?? BUILTIN_AGENTS[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="agent-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full bg-base-200/70 px-2.5 py-1 text-xs',
          'hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50',
        )}
        title={disabled ? '等连上 claw 才能选择助手' : '选择下一条消息交给谁处理'}
        aria-disabled={disabled || undefined}
      >
        <span aria-hidden>{active.emoji}</span>
        <span className="text-base-content/80">{active.name}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="h-3 w-3 text-base-content/45">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            data-testid="agent-picker-menu"
            style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, zIndex: 9999 }}
            className="w-72 max-h-80 overflow-y-auto rounded-2xl bg-base-100 p-1.5 shadow-xl ring-1 ring-base-300/60"
          >
            {visibleAgents.map((a) => (
              <button
                key={a.id}
                type="button"
                data-testid={`agent-option-${a.id}`}
                onClick={() => { onChange(a.id); setOpen(false); }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-base-200',
                  a.id === activeAgentId && 'bg-primary/10',
                )}
              >
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-base-200 text-lg">
                  {a.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="mt-0.5 text-xs text-base-content/55 leading-snug">{a.desc}</div>
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
