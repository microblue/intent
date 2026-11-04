import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ApprovalPayload, Entry, PlanPayload, QuestionPayload, ResultPayload } from '@shared/types';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';

type Act = {
  answer: (entryId: string, answer: string) => void;
  plan: (entryId: string, decision: 'accepted' | 'change') => void;
  approval: (entryId: string, decision: 'approved' | 'declined') => void;
  paid: (entryId: string) => void;
  speak: (id: string, text: string) => void;
  speakingId: string | null;
  canSpeak: boolean;
  /** Only the newest card can still be acted on. */
  disabled: boolean;
};

export function EntryView({ entry, act, isLatestCard }: { entry: Entry; act: Act; isLatestCard: boolean }) {
  switch (entry.kind) {
    case 'text':
      return entry.by === 'user' ? <UserBubble text={entry.payload.text} /> : <IntentBubble id={entry.id} text={entry.payload.text} act={act} />;
    case 'question':
      return <QuestionCard id={entry.id} p={entry.payload} act={act} live={isLatestCard} />;
    case 'plan':
      return <PlanCard id={entry.id} p={entry.payload} act={act} live={isLatestCard} />;
    case 'approval':
      return <ApprovalCard id={entry.id} p={entry.payload} act={act} />;
    case 'result':
      return <ResultCard id={entry.id} p={entry.payload} act={act} />;
    case 'activity':
      return <p className="px-2 text-base text-ink-soft">· {entry.payload.text}</p>;
    case 'refusal':
      return (
        <div role="alert" className="rounded-2xl border-2 border-danger/40 bg-danger-soft p-4 text-lg text-ink">
          {entry.payload.text}
        </div>
      );
  }
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-3 text-lg text-white">{text}</div>
    </div>
  );
}

function SpeakButton({ id, text, act }: { id: string; text: string; act: Act }) {
  const t = useT();
  if (!act.canSpeak) return null;
  const on = act.speakingId === id;
  return (
    <button type="button" onClick={() => act.speak(id, text)} className="btn-small -ml-2 text-brand hover:bg-brand-soft" aria-pressed={on}>
      <span aria-hidden>{on ? '⏹' : '🔊'}</span>
      {on ? t.thing.stopReading : t.thing.readAloud}
    </button>
  );
}

function IntentBubble({ id, text, act }: { id: string; text: string; act: Act }) {
  return (
    <div className="max-w-[92%]">
      <div className="prose-intent rounded-2xl rounded-bl-md bg-sand px-4 py-3 text-lg text-ink">
        <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
      </div>
      <SpeakButton id={id} text={text} act={act} />
    </div>
  );
}

function CardShell({ children, tone = 'plain', label }: { children: React.ReactNode; tone?: 'plain' | 'wait'; label?: string }) {
  return (
    <section
      aria-label={label}
      className={`rounded-3xl border-2 p-5 ${tone === 'wait' ? 'border-wait-line bg-wait' : 'border-line bg-white'}`}
    >
      {children}
    </section>
  );
}

function QuestionCard({ id, p, act, live }: { id: string; p: QuestionPayload; act: Act; live: boolean }) {
  const open = !p.answer && live;
  return (
    <CardShell tone={open ? 'wait' : 'plain'}>
      <p className="text-xl font-semibold text-ink">{p.question}</p>
      {p.answer ? (
        <p className="mt-3 text-lg text-ink-soft">
          ✓ <span className="font-semibold text-ink">{p.answer}</span>
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {p.options.map((o) => (
            <button key={o} type="button" disabled={!open || act.disabled} onClick={() => act.answer(id, o)} className="btn-soft justify-start text-left">
              {o}
            </button>
          ))}
        </div>
      )}
      {open && <SpeakButton id={id} text={`${p.question} ${p.options.join('，')}`} act={act} />}
    </CardShell>
  );
}

function PlanCard({ id, p, act, live }: { id: string; p: PlanPayload; act: Act; live: boolean }) {
  const t = useT();
  const open = !p.decision && live;
  return (
    <CardShell tone={open ? 'wait' : 'plain'} label={t.plan.title}>
      <h3 className="text-xl font-bold text-ink">{t.plan.title}</h3>
      <ol className="mt-3 space-y-2">
        {p.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-lg">
            <span
              aria-hidden
              className={`mt-0.5 flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-full text-base font-bold ${
                s.state === 'done' ? 'bg-brand text-white' : s.state === 'doing' ? 'bg-accent text-accent-content' : 'bg-sand text-ink-soft'
              }`}
            >
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span className={s.state === 'done' ? 'text-ink-soft' : 'text-ink'}>{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-base text-ink-soft">
        {t.plan.eta}
        {p.eta}
      </p>
      {open ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" disabled={act.disabled} onClick={() => act.plan(id, 'change')} className="btn-soft">
            {t.plan.change}
          </button>
          <button type="button" disabled={act.disabled} onClick={() => act.plan(id, 'accepted')} className="btn-main">
            {t.plan.ok}
          </button>
        </div>
      ) : (
        p.decision === 'accepted' && <p className="mt-3 text-base font-semibold text-brand">✓ {t.plan.accepted}</p>
      )}
      {open && <SpeakButton id={id} text={`${t.plan.title}。${p.steps.map((s) => s.text).join('。')}`} act={act} />}
    </CardShell>
  );
}

function fmtMoney(cents: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** The five things every approval must say: what, to whom, how much, why, undo (spec §7.2). */
function ApprovalCard({ id, p, act }: { id: string; p: ApprovalPayload; act: Act }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const open = !p.decision;
  return (
    <CardShell tone={open ? 'wait' : 'plain'} label={t.approval.title}>
      <p className="text-base font-semibold text-ink-soft">{t.approval.buy}</p>
      <p className="mt-1 text-xl font-bold text-ink">{p.item}</p>
      <p className="mt-2 text-3xl font-bold text-ink" data-testid="approval-amount">
        {fmtMoney(p.amountCents, p.currency, lang)}
      </p>
      <dl className="mt-4 space-y-3 text-lg">
        <div>
          <dt className="text-base text-ink-soft">{t.approval.at}</dt>
          <dd className="font-semibold">
            {p.merchant}
            {p.firstTimeMerchant && (
              <span className="ml-2 inline-block rounded-lg bg-accent px-2 py-0.5 text-base font-semibold text-accent-content">{t.approval.firstTime}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-base text-ink-soft">{t.approval.why}</dt>
          <dd>{p.why}</dd>
        </div>
        <div>
          <dt className="text-base text-ink-soft">{t.approval.undo}</dt>
          <dd>{p.undo}</dd>
        </div>
      </dl>
      {open && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" disabled={act.disabled} onClick={() => act.approval(id, 'declined')} className="btn-soft">
              {t.approval.no}
            </button>
            <button type="button" disabled={act.disabled} onClick={() => act.approval(id, 'approved')} className="btn-main">
              {t.approval.yes}
            </button>
          </div>
          <p className="mt-3 text-base text-ink-soft">{t.approval.noTimer}</p>
        </>
      )}
      {p.decision === 'approved' && !p.paid && (
        <div className="mt-4 space-y-3">
          <p className="text-lg font-semibold text-brand">✓ {t.approval.approved}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer noopener" className="btn-main">
                {t.approval.goPay} ↗
              </a>
            )}
            <button type="button" disabled={act.disabled} onClick={() => act.paid(id)} className="btn-soft">
              {t.approval.paid}
            </button>
          </div>
        </div>
      )}
      {p.paid && <p className="mt-4 text-lg font-semibold text-brand">✓ {t.approval.paidDone}</p>}
      {p.decision === 'declined' && <p className="mt-4 text-lg text-ink-soft">{t.approval.declined}</p>}
    </CardShell>
  );
}

function ResultCard({ id, p, act }: { id: string; p: ResultPayload; act: Act }) {
  const t = useT();
  return (
    <CardShell>
      <h3 className="text-xl font-bold text-ink">{p.title}</h3>
      <div className="prose-intent mt-2 text-lg">
        <Markdown remarkPlugins={[remarkGfm]} components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>
          {p.body}
        </Markdown>
      </div>
      {p.sources && p.sources.length > 0 && (
        <details className="mt-3 text-base">
          <summary className="cursor-pointer text-brand">{t.result.sources}</summary>
          <ul className="mt-2 space-y-1">
            {p.sources.map((s) => (
              <li key={s.url}>
                <a className="underline" href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <SpeakButton id={id} text={`${p.title}。${p.body}`} act={act} />
    </CardShell>
  );
}

export type { Act };
