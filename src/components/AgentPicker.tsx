import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';

/**
 * AgentPicker — small inline button + popover that lets the user
 * choose which OpenClaw agent handles the next chat turn. The 12
 * personas are provisioned on the user's claw and routed to via
 * useGatewayChat's agentId parameter.
 *
 * The default agent is `main` (general-purpose Claw). Switching is
 * per-thread: state lives in useChatThread. Selection persists for
 * the rest of the thread until the user picks something else.
 */

const SPECIALIZED_AGENTS = [
  { id: 'main',          name: 'Claw',         emoji: '🦞', desc: '通用助手,什么都能聊' },
  { id: 'researcher',    name: '研究员',       emoji: '🔬', desc: '查资料 / 读网页 / 整理信息' },
  { id: 'planner',       name: '规划员',       emoji: '🗺️', desc: '把事情拆成步骤 + 时间表' },
  { id: 'writer',        name: '写手',         emoji: '✍️', desc: '写文档 / 改文字' },
  { id: 'flights',       name: '机票助手',     emoji: '✈️', desc: '比价 + 盯价格' },
  { id: 'lodging',       name: '住宿助手',     emoji: '🏨', desc: '酒店 / 民宿候选 + 订房' },
  { id: 'mealplanner',   name: '吃饭助手',     emoji: '🍳', desc: '菜单 / 采购清单' },
  { id: 'tutor',         name: '陪练',         emoji: '📚', desc: '出题 / 批改 / 复习清单' },
  { id: 'comparator',    name: '比价员',       emoji: '⚖️', desc: '多商品对比表' },
  { id: 'reminder',      name: '提醒员',       emoji: '⏰', desc: '定时和事件触发' },
  { id: 'mailreader',    name: '邮件助手',     emoji: '📧', desc: '从邮件抽订单 / 行程' },
  { id: 'shopper',       name: '购物员',       emoji: '🛒', desc: '下单 + 付款流程' },
  { id: 'familycontact', name: '家人联络员',   emoji: '💞', desc: '帮你给家人发消息' },
];

export function AgentPicker({
  activeAgentId,
  onChange,
  disabled = false,
}: {
  activeAgentId: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const active = SPECIALIZED_AGENTS.find((a) => a.id === activeAgentId) ?? SPECIALIZED_AGENTS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="agent-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full bg-base-200/70 px-2.5 py-1 text-xs',
          'hover:bg-base-200 disabled:opacity-50',
        )}
        title="切换助手"
      >
        <span aria-hidden>{active.emoji}</span>
        <span className="text-base-content/80">{active.name}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="h-3 w-3 text-base-content/45">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          data-testid="agent-picker-menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 max-h-80 overflow-y-auto rounded-2xl bg-base-100 p-1.5 shadow-xl ring-1 ring-base-300/60"
        >
          {SPECIALIZED_AGENTS.map((a) => (
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
        </div>
      )}
    </div>
  );
}
