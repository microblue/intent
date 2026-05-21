import { Link } from '@tanstack/react-router';
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
  const { events: list, isLoading, error } = useScheduleEvents();

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
                ? '还没有提醒。跟任意一个项目里的助手说一句就行。'
                : `一共 ${list.length} 件事在等时间到。点开任意一条进项目里继续聊。`
        }
      />

      {/* How to add a reminder. The composer used to be here as a
          natural-language quick-add input, but parsing 自然语言时间
          ("每周一 9 点开会") into a fire_at + recurrence reliably
          belongs in a reminder agent, not in the SPA. aios-design.md
          and the lay-user-first rule "errors are friendly, not status
          codes" both point at making the path obvious instead of
          surfacing a toast that pretends to save. Until the reminder
          agent ships, the canonical path is: open any project →
          tell its assistant "到时候提醒我..." → the agent INSERTs
          the schedule_events row on the user's behalf. */}
      <article
        data-testid="schedule-add-hint"
        className="mb-8 flex items-start gap-3 rounded-2xl bg-base-200/70 p-4 ring-1 ring-base-300/40"
      >
        <span aria-hidden className="text-2xl">✨</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">想加新提醒?跟某件事里的助手说一句</div>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-base-content/65">
            比如在「东京樱花季旅行」里说「6/10 前买好机票提醒我」,助手会记下时间,到点就响。
          </p>
          <Link
            to="/new"
            search={{ seed: undefined }}
            data-testid="schedule-add-cta"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-content"
          >
            <span aria-hidden>➕</span>
            起一件新事
          </Link>
        </div>
      </article>

      {isLoading && (
        <div data-testid="schedule-skeleton" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl bg-base-200/60 ring-1 ring-base-300/40"
            />
          ))}
        </div>
      )}

      {!isLoading && (['今天', '明天', '这周', '以后'] as const).map((b) =>
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

      {!isLoading && !error && list.length === 0 && (
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
            在某件事里跟助手说「到时候提醒我」就行,助手会记下时间。
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
