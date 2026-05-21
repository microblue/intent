import { useState } from 'react';
import { toast } from 'sonner';
import {
  useIntentAgents,
  useAddTeamMember,
  useRemoveTeamMember,
} from '@/data/useIntentAgents';
import { BUILTIN_AGENTS, findBuiltinAgent } from '@/lib/agents';
import { cn } from '@/lib/cn';
import { friendlyError } from '@/lib/friendlyError';

/**
 * TeamPanel — "助手团队" rail item inside IntentHome's right rail.
 *
 * Shows the agents invited to this intent. The orchestrator (main)
 * always appears first with a small "主理" tag; specialists are listed
 * beneath. The "+ 加助手" button opens a sheet to pick from the 12
 * built-in agents the user hasn't added yet.
 *
 * Mock-mode shows the default team (main only) and the add/remove
 * buttons surface a friendly "演示模式" toast.
 */

export function TeamPanel({ intentId }: { intentId: string }) {
  const { team, isLoading } = useIntentAgents(intentId);
  const { remove } = useRemoveTeamMember(intentId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const onRemove = async (agentKey: string) => {
    try {
      await remove(agentKey);
    } catch (err) {
      toast(friendlyError(err, '移除失败'));
    }
  };

  return (
    <section
      data-testid="team-panel"
      className="rounded-2xl bg-base-200/40 p-3 ring-1 ring-base-300/40"
    >
      <header className="mb-2.5 flex items-baseline gap-2">
        <span aria-hidden>🤝</span>
        <h3 className="text-sm font-semibold">助手团队</h3>
        <span className="ml-auto text-[11px] text-base-content/45">
          {team.length} 位
        </span>
      </header>

      {isLoading && (
        <div className="py-2 text-xs text-base-content/50">加载中…</div>
      )}

      <ul className="flex flex-col gap-1.5">
        {team.map((m) => {
          const agent = findBuiltinAgent(m.agentKey);
          return (
            <li
              key={m.agentKey}
              data-testid={`team-member-${m.agentKey}`}
              className="group flex items-center gap-2.5 rounded-xl bg-base-100 px-2.5 py-1.5 ring-1 ring-base-300/30"
            >
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-base-200 text-base">
                {agent?.emoji ?? '✦'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{agent?.name ?? m.displayName}</span>
                  {m.isOrchestrator && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                      主理
                    </span>
                  )}
                </div>
                {agent?.desc && (
                  <div className="truncate text-[11px] text-base-content/55">
                    {agent.desc}
                  </div>
                )}
              </div>
              {!m.isOrchestrator && (
                <button
                  type="button"
                  data-testid={`team-remove-${m.agentKey}`}
                  onClick={() => onRemove(m.agentKey)}
                  aria-label={`移除 ${agent?.name ?? m.displayName}`}
                  className="rounded-md p-1 text-base-content/40 transition hover:bg-base-200 hover:text-error sm:opacity-0 sm:group-hover:opacity-100"
                  title="移除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        data-testid="team-add-trigger"
        onClick={() => setPickerOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-base-100 px-3 py-1.5 text-xs text-base-content/60 ring-1 ring-base-300/40 hover:bg-base-200"
      >
        <span aria-hidden>＋</span>
        <span>加助手</span>
      </button>

      {pickerOpen && (
        <AddMemberSheet
          intentId={intentId}
          alreadyMembers={team.map((t) => t.agentKey)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

function AddMemberSheet({
  intentId,
  alreadyMembers,
  onClose,
}: {
  intentId: string;
  alreadyMembers: string[];
  onClose: () => void;
}) {
  const { add, isPending } = useAddTeamMember(intentId);
  const memberSet = new Set(alreadyMembers);

  const onPick = async (agentKey: string) => {
    try {
      await add(agentKey);
      onClose();
    } catch (err) {
      toast(friendlyError(err, '加不上,稍后再试'));
    }
  };

  const available = BUILTIN_AGENTS.filter((a) => !memberSet.has(a.id));

  return (
    <div
      data-testid="team-add-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center bg-base-content/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-base-100 p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center gap-2">
          <span aria-hidden>🤝</span>
          <h3 className="text-base font-semibold">把谁加进来?</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto rounded-md p-1 text-base-content/45 hover:bg-base-200"
          >
            ✕
          </button>
        </header>

        {available.length === 0 ? (
          <div className="py-6 text-center text-sm text-base-content/55">
            12 位都在团队里了 ✓
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
            {available.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-testid={`team-add-option-${a.id}`}
                  disabled={isPending}
                  onClick={() => onPick(a.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl bg-base-100 p-2.5 text-left ring-1 ring-base-300/40 hover:bg-base-200',
                    isPending && 'opacity-50',
                  )}
                >
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-base-200 text-lg">
                    {a.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="mt-0.5 text-xs text-base-content/55 leading-snug">
                      {a.pitch}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
