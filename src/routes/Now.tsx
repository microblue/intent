import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { useUI } from '@/state/ui';
import {
  approvals,
  findAgent,
  findIntent,
  nowSorted,
  type NowActivity,
} from '@/mocks';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/cn';

/**
 * 正在做的事 — the cross-Intent activity feed, now a proper route page
 * instead of a slide-in panel. Same back-button + page-header pattern every
 * other navigation destination uses, so users get the same mental model for
 * "I'm on a page, I can go back" no matter which dock item they tapped.
 */
export function NowPage() {
  const items = nowSorted();
  const awaiting = items.filter((i) => i.kind === 'awaiting_approval');
  const running = items.filter((i) => i.kind === 'running');
  const done = items.filter((i) => i.kind === 'completed');
  const devMode = useUI((s) => s.devMode);

  return (
    <div className="w-full px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <PageHeader
        emoji="🛎"
        title="正在为你做的事"
        term="activity"
        subtitle={`${awaiting.length} 件等你点头 · ${running.length} 件在跑 · ${done.length} 件刚做完`}
      />

      {awaiting.length === 0 && running.length === 0 && done.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-base-300/60 bg-base-100/40 p-8 text-center">
          <div className="text-4xl">☕</div>
          <div className="mt-3 text-base font-medium">现在很安静</div>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-base-content/55">
            没有助手在忙,也没有事等你点头。<br />
            这里会显示:正在干活的助手 · 等你做决定的事 · 刚刚做完的步骤。
          </p>
          <p className="mx-auto mt-3 max-w-md text-xs text-base-content/45">
            去看看你正在做的事 →
          </p>
        </div>
      )}

      {awaiting.length > 0 && (
        <Section title="等你点头" secondary="Approval" tone="warning">
          {awaiting.map((a) => (
            <ApprovalCard key={a.id} activity={a} devMode={devMode} />
          ))}
        </Section>
      )}

      {running.length > 0 && (
        <Section title="正在做" secondary="Step · running" tone="info">
          {running.map((a) => (
            <RunningRow key={a.id} activity={a} devMode={devMode} />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="刚刚做完" secondary="Step · done" tone="muted">
          {done.map((a) => (
            <DoneRow key={a.id} activity={a} devMode={devMode} />
          ))}
        </Section>
      )}
    </div>
  );
}

/* ─────── section / card components ─────── */

function Section({
  title,
  secondary,
  tone,
  children,
}: {
  title: string;
  secondary: string;
  tone: 'warning' | 'info' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2
        className={cn(
          'mb-2 flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-wide',
          tone === 'warning' && 'text-warning',
          tone === 'info' && 'text-info',
          tone === 'muted' && 'text-base-content/45',
        )}
      >
        <span>{title}</span>
        <span className="font-normal opacity-60">· {secondary}</span>
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function ApprovalCard({ activity, devMode }: { activity: NowActivity; devMode: boolean }) {
  const intent = findIntent(activity.intentId);
  const approval = approvals.find((a) => a.id === activity.approvalId);
  if (!intent || !approval) return null;

  return (
    <article className="rounded-2xl bg-base-100 p-4 shadow-sm ring-1 ring-warning/30">
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-lg text-base shadow-sm"
          style={{ background: intent.cover }}
        >
          {intent.emoji}
        </span>
        <Link
          to="/intent/$intentId"
          params={{ intentId: intent.id }}
          className="truncate text-xs font-medium text-base-content/65 hover:underline"
        >
          {intent.title}
        </Link>
        <span className="ml-auto text-[0.8125rem] text-base-content/40">{timeAgo(activity.since)}</span>
      </header>
      <p className="mt-2.5 text-sm leading-relaxed">{approval.prompt}</p>
      {approval.detail && (
        <p className="mt-1 text-[0.875rem] text-base-content/55">{approval.detail}</p>
      )}
      {devMode && activity.agentKey && <AgentBadge agentKey={activity.agentKey} />}
      {approval.options && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {approval.options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() =>
                toast(`已选:${o.label}`, { description: '(Phase 6 真实接入 OpenClaw)' })
              }
              className={cn(
                'btn btn-sm rounded-full',
                o.kind === 'primary' ? 'btn-primary' : 'btn-ghost',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function RunningRow({ activity, devMode }: { activity: NowActivity; devMode: boolean }) {
  const intent = findIntent(activity.intentId);
  if (!intent) return null;
  return (
    <Link
      to="/intent/$intentId"
      params={{ intentId: intent.id }}
      className="flex items-start gap-3 rounded-2xl bg-base-100 px-3 py-3 ring-1 ring-base-300/40 hover:bg-base-200/50"
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base shadow-sm"
        style={{ background: intent.cover }}
      >
        {intent.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
          <span className="truncate text-sm">{activity.summary}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-base-content/50">
          {intent.title} · {timeAgo(activity.since)}
        </div>
        {devMode && activity.agentKey && <AgentBadge agentKey={activity.agentKey} />}
      </div>
    </Link>
  );
}

function DoneRow({ activity, devMode }: { activity: NowActivity; devMode: boolean }) {
  const intent = findIntent(activity.intentId);
  if (!intent) return null;
  return (
    <Link
      to="/intent/$intentId"
      params={{ intentId: intent.id }}
      className="flex items-start gap-3 rounded-2xl bg-base-100/50 px-3 py-3 ring-1 ring-base-300/40 hover:bg-base-200/50"
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base shadow-sm opacity-80"
        style={{ background: intent.cover }}
      >
        {intent.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 text-success"
          >
            <path d="M5 12l4 4L19 7" />
          </svg>
          <span className="truncate text-sm text-base-content/85">{activity.summary}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-base-content/45">
          {intent.title} · {timeAgo(activity.since)}
        </div>
        {devMode && activity.agentKey && <AgentBadge agentKey={activity.agentKey} muted />}
      </div>
    </Link>
  );
}

function AgentBadge({ agentKey, muted = false }: { agentKey: string; muted?: boolean }) {
  const agent = findAgent(agentKey);
  if (!agent) return null;
  return (
    <span
      className={cn(
        'mt-1.5 inline-flex items-center gap-1 rounded-full bg-base-200 px-2 py-0.5 text-[0.8125rem] text-base-content/65',
        muted && 'opacity-70',
      )}
    >
      <span aria-hidden>{agent.emoji}</span>
      <span>{agent.displayName}</span>
    </span>
  );
}
