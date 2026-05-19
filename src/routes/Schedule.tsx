import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { findIntent, type ScheduleEvent } from '@/mocks';
import { useScheduleEvents } from '@/data/useScheduleEvents';

const MOCK_NOW = new Date('2026-05-13T10:30:00+08:00');
const dayMs = 86_400_000;

function bucketOf(iso: string): '今天' | '明天' | '这周' | '以后' {
  const t = new Date(iso).getTime();
  const today = new Date(MOCK_NOW);
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const dayDiff = Math.floor((t - todayStart) / dayMs);
  if (dayDiff === 0) return '今天';
  if (dayDiff === 1) return '明天';
  if (dayDiff < 7) return '这周';
  return '以后';
}

function timeOf(iso: string) {
  const d = new Date(iso);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { weekday: wd, hm: `${hh}:${mm}`, date: `${d.getMonth() + 1}/${d.getDate()}` };
}

export function SchedulePage() {
  const { events: list, isLoading, error, isMock } = useScheduleEvents();
  const [draft, setDraft] = useState('');

  const buckets: Record<string, ScheduleEvent[]> = { 今天: [], 明天: [], 这周: [], 以后: [] };
  for (const e of list) buckets[bucketOf(e.fireAt)].push(e);

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader
        emoji="🔔"
        title="提醒"
        term="schedule"
        subtitle={
          isLoading
            ? '让我看看你有什么要提醒的 ——'
            : error
              ? '提醒列表读不出来,稍等再试。'
              : list.length === 0
                ? '还没有提醒。直接在下面写一句,比如「每周一 9 点开会」。'
                : `一共 ${list.length} 件事在等时间到。点开任意一条进项目里继续聊。`
        }
      />

      {/* Natural-language quick-add */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          // Quick-add still toast-only — parsing natural-language to a
          // fire_at + recurrence needs the intent-summariser agent. The
          // real INSERT path is wired through useAddScheduleEvent for
          // when the chat agent eventually calls it on the user's behalf.
          toast(
            isMock
              ? '已记下(演示模式不会保存)'
              : '已记下(自然语言解析等 agent 接入)',
            { description: draft },
          );
          setDraft('');
        }}
        className="mb-8 flex items-center gap-2 rounded-2xl bg-base-200 px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/40"
      >
        <span aria-hidden className="text-lg">
          ✨
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'加一个提醒 — 直接说,比如「每周一早上提醒我去运动」'}
          className="flex-1 bg-transparent text-sm placeholder:text-base-content/45 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-content disabled:bg-base-300 disabled:text-base-content/40"
        >
          加
        </button>
      </form>

      {(['今天', '明天', '这周', '以后'] as const).map((b) =>
        buckets[b].length === 0 ? null : (
          <section key={b} className="mb-7">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">
              {b}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {buckets[b].map((e) => (
                <EventRow key={e.id} event={e} bucket={b} />
              ))}
            </ul>
          </section>
        ),
      )}

      {list.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-base-300/60 bg-base-100/40 p-8 text-center">
          <div className="text-4xl">🔔</div>
          <div className="mt-3 text-base font-medium">没有要提醒的事</div>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-base-content/55">
            常见用法 ——<br />
            <span className="text-base-content/70">「妈妈生日 5/19」</span> ·{' '}
            <span className="text-base-content/70">「每周一 9 点周会」</span> ·{' '}
            <span className="text-base-content/70">「月底整理账单」</span>
          </p>
          <p className="mx-auto mt-3 max-w-md text-xs text-base-content/45">
            在上面那行直接说就行,或者在某件意图里跟助手说「到时候提醒我」。
          </p>
        </div>
      )}
    </div>
  );
}

function EventRow({ event, bucket }: { event: ScheduleEvent; bucket: string }) {
  const intent = findIntent(event.intentId);
  const t = timeOf(event.fireAt);
  return (
    <li>
      <Link
        to="/intent/$intentId"
        params={{ intentId: event.intentId }}
        className="group flex items-center gap-3 rounded-2xl bg-base-200/60 p-3.5 ring-1 ring-base-300/40 transition hover:bg-base-200 hover:ring-primary/30"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl shadow-sm"
          style={{ background: intent?.cover ?? 'oklch(30% 0.01 270)' }}
        >
          {intent?.emoji ?? '⏰'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{event.title}</div>
          <div className="mt-0.5 truncate text-xs text-base-content/55">
            {intent?.title} · {bucket === '今天' || bucket === '明天' ? '' : t.weekday + ' '}{t.date} {t.hm}
            {event.recurrence && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-base-300/60 px-1.5 py-px text-[0.8125rem]">
                ↻ {event.recurrence.label}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">{t.hm}</div>
        </div>
      </Link>
    </li>
  );
}
