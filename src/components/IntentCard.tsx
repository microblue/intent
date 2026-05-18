import { Link } from '@tanstack/react-router';
import type { Intent } from '@/mocks';
import { conceptCountsFor } from '@/mocks';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/cn';

export function IntentCard({ intent }: { intent: Intent }) {
  const counts = conceptCountsFor(intent.id);
  const hasApprovals = counts.pendingApprovals > 0;
  const hasRunning = counts.running > 0;

  return (
    <Link
      to="/intent/$intentId"
      params={{ intentId: intent.id }}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-base-200 shadow-sm ring-1 ring-base-300/40 transition hover:-translate-y-0.5 hover:shadow-xl hover:ring-primary/30"
    >
      <div
        className="relative aspect-[5/3] overflow-hidden"
        style={{ background: intent.cover }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <span
          className="absolute left-5 top-5 text-4xl drop-shadow-md transition group-hover:scale-110"
          aria-hidden
        >
          {intent.emoji}
        </span>

        {/* Top-right: 置顶 + counts */}
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {intent.lifecycle === 'pinned' && (
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-[0.8125rem] font-medium text-white backdrop-blur-md">
              置顶
            </span>
          )}
        </div>

        {/* Bottom-left: urgent status — only the strongest signal shows here */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
          {hasApprovals && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[0.8125rem] font-medium text-warning-content shadow-sm"
              title="助手有事等你点头"
            >
              <span aria-hidden>⚠️</span>
              {counts.pendingApprovals} 件等你点头
            </span>
          )}
          {hasRunning && !hasApprovals && (
            <span className="inline-flex items-center gap-1 rounded-full bg-info/90 px-2 py-0.5 text-[0.8125rem] font-medium text-info-content shadow-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info-content" />
              {counts.running} 件在做
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-base font-semibold leading-tight">{intent.title}</h3>
        <p className="line-clamp-2 text-sm text-base-content/65">{intent.preview}</p>

        {/* Concept counts strip — quick "what's inside" hint */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/55">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>🤝</span>
            {counts.agents} 助手
          </span>
          {counts.outlineTotal > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>☑</span>
              {counts.outlineDone}/{counts.outlineTotal}
            </span>
          )}
          {counts.files > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>📁</span>
              {counts.files}
            </span>
          )}
          {counts.schedule > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>🔔</span>
              {counts.schedule}
            </span>
          )}
        </div>

        <div className={cn('mt-auto pt-3 text-xs text-base-content/45')}>
          {timeAgo(intent.lastActiveAt)}
        </div>
      </div>
    </Link>
  );
}

export function NewIntentCard() {
  return (
    <Link
      to="/new"
      search={{ seed: undefined }}
      className="group flex aspect-[5/3.6] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-base-300 bg-base-100/40 transition hover:border-primary/50 hover:bg-base-200"
    >
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-2xl bg-base-200 text-2xl text-base-content/60 transition group-hover:bg-primary/15 group-hover:text-primary"
      >
        ✨
      </span>
      <div className="text-center">
        <div className="text-sm font-medium">新想做的事</div>
        <div className="text-xs text-base-content/55">
          一句话告诉我想做什么
        </div>
      </div>
    </Link>
  );
}
