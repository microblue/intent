import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { findIntent, type ScheduleEvent } from '@/mocks';
import { useScheduleEvents, useAddScheduleEvent } from '@/data/useScheduleEvents';
import { useIntents } from '@/data/useIntents';
import { parseReminder } from '@/lib/parseReminder';
import { friendlyError } from '@/lib/friendlyError';

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

      <AddReminderComposer />

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

/* ─── Add reminder composer (NL parser → schedule_events.insert) ─── */

function AddReminderComposer() {
  const { intents, isLoading: intentsLoading } = useIntents();
  const { add, isPending, isMock } = useAddScheduleEvent();
  const [text, setText] = useState('');
  const [intentId, setIntentId] = useState<string>('');

  // Default the intent picker to the user's most-recent intent so most
  // submissions don't need to think about which project to attach to.
  const defaultIntentId = intents[0]?.id ?? '';
  const effectiveIntentId = intentId || defaultIntentId;

  // Live preview — re-parses on every keystroke so users see whether
  // their phrasing is being understood before they submit.
  const preview = useMemo(() => parseReminder(text), [text]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) {
      toast('我没听明白时间。试试「明天早上 9 点 吃药」「每周一 9 点 周会」「5 月 19 日 中午 12 点 妈妈生日」这样的写法。');
      return;
    }
    if (!effectiveIntentId) {
      toast('得先有一件事可以挂这条提醒。先起一件新事 ——', { id: 'reminder-no-intent' });
      return;
    }
    try {
      await add({
        intentId: effectiveIntentId,
        title: preview.title,
        fireAt: preview.fireAt,
        recurrence: preview.recurrence,
      });
      toast(preview.recurrence
        ? `好,${preview.recurrence.label} 我会提醒你「${preview.title}」`
        : `好,${new Date(preview.fireAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })} 提醒「${preview.title}」`);
      setText('');
    } catch (err) {
      toast(friendlyError(err, '保存提醒时卡了一下,再试试?'));
    }
  };

  if (!intentsLoading && intents.length === 0) {
    return (
      <article className="mb-8 flex items-start gap-3 rounded-2xl bg-base-200/70 p-4 ring-1 ring-base-300/40">
        <span aria-hidden className="text-2xl">✨</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">提醒得挂在一件事上 —— 先起一件</div>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-base-content/65">
            起一件新事后,在这里就能用一句话加提醒(「每周一 9 点 周会」「明天 8 点 跑步」)。
          </p>
          <Link
            to="/new"
            search={{ seed: undefined }}
            data-testid="schedule-add-cta"
            className="btn btn-primary mt-3 gap-1.5 rounded-full"
          >
            <span aria-hidden>➕</span>
            起一件新事
          </Link>
        </div>
      </article>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="schedule-composer"
      className="mb-8 flex flex-col gap-3 rounded-2xl bg-base-200/70 p-4 ring-1 ring-base-300/40"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl">⏰</span>
        <div className="min-w-0 flex-1">
          <label htmlFor="reminder-nl" className="text-sm font-medium">
            加一条提醒 —— 一句话说时间和事
          </label>
          <p className="mt-0.5 text-[0.875rem] text-base-content/55">
            比如「明天 8 点 跑步」「每周一 9 点 周会」「5 月 19 日 中午 12 点 妈妈生日」。
          </p>
        </div>
      </div>

      <input
        id="reminder-nl"
        data-testid="schedule-composer-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="试试「每周一 9 点 周会」"
        className="input input-bordered w-full"
        autoComplete="off"
      />

      {/* Intent picker — defaults to most recent, lets user pick. */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="reminder-intent" className="text-xs text-base-content/60">
          挂在
        </label>
        <select
          id="reminder-intent"
          data-testid="schedule-composer-intent"
          value={effectiveIntentId}
          onChange={(e) => setIntentId(e.target.value)}
          className="select select-bordered select-sm max-w-[18rem]"
        >
          {intents.map((it) => (
            <option key={it.id} value={it.id}>
              {it.emoji} {it.title}
            </option>
          ))}
        </select>
        <span className="text-xs text-base-content/45">上面</span>
      </div>

      {/* Live parse preview */}
      {text.trim() && (
        <div
          data-testid="schedule-composer-preview"
          className={
            preview
              ? 'rounded-xl bg-success/10 px-3 py-2 text-[0.875rem] text-success-content ring-1 ring-success/30'
              : 'rounded-xl bg-base-300/40 px-3 py-2 text-[0.875rem] text-base-content/55'
          }
        >
          {preview ? (
            <>
              <span className="font-medium">✓ 我会提醒你:</span>
              <span className="ml-1">「{preview.title}」</span>
              <span className="ml-1 text-base-content/70">
                {preview.recurrence
                  ? `· ${preview.recurrence.label}`
                  : `· ${new Date(preview.fireAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}`}
              </span>
            </>
          ) : (
            <>没看出来时间。试试加个「明天」「每周一」「5 月 19 日」这样的提示。</>
          )}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={isPending || !preview}
          data-testid="schedule-composer-submit"
          className="btn btn-primary rounded-full"
        >
          {isPending ? '保存中…' : '记下来'}
        </button>
      </div>

      {isMock && (
        <p className="text-[11px] text-base-content/40">
          演示模式 · 这条提醒不会真的保存。登录后再来,在你自己的项目下加。
        </p>
      )}
    </form>
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
