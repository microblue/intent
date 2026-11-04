import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Entry, UserInput } from '@shared/types';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useArchive, useSendInput, useThing } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Composer } from '@/components/Composer';
import { EntryView, type Act } from '@/components/cards';
import { useSpeaker } from '@/components/voice';

const CARD_KINDS: Entry['kind'][] = ['question', 'plan', 'approval'];

/** One thing: a single conversation column with cards inline (spec §5.3). */
export function ThingPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { id } = useParams({ from: '/t/$id' });
  const { data, isLoading, error } = useThing(id);
  const send = useSendInput(id);
  const archive = useArchive();
  const speaker = useSpeaker(lang);
  const [changeKey, setChangeKey] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);

  const entries = data?.entries ?? [];
  const thing = data?.thing;
  const busy = !!thing?.busy || send.isPending;

  const latestCardId = useMemo(() => [...entries].reverse().find((e) => CARD_KINDS.includes(e.kind))?.id, [entries]);
  const openQuestion = useMemo(() => {
    const e = entries.find((x) => x.id === latestCardId);
    return e?.kind === 'question' && !e.payload.answer ? e : undefined;
  }, [entries, latestCardId]);
  const lastIsError = entries.at(-1)?.kind === 'refusal' && entries.at(-1)?.by === 'system';

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries.length, busy]);

  const go = (input: UserInput) =>
    send.mutate(input, {
      onError: (err) => toast.error(err instanceof ApiError && err.status === 409 ? t.errors.busy : t.errors.network),
    });

  const act: Act = {
    answer: (entryId, answer) => go({ type: 'answer', entryId, answer }),
    plan: (entryId, decision) => {
      go({ type: 'plan', entryId, decision });
      if (decision === 'change') setChangeKey((k) => k + 1);
    },
    approval: (entryId, decision) => go({ type: 'approval', entryId, decision }),
    paid: (entryId) => go({ type: 'paid', entryId }),
    speak: speaker.speak,
    speakingId: speaker.speakingId,
    canSpeak: speaker.supported,
    disabled: busy,
  };

  if (isLoading) return null;
  if (error || !thing) {
    return (
      <div className="space-y-4">
        <p className="text-xl">{t.thing.notFound}</p>
        <Link to="/" className="btn-main">
          {t.thing.back}
        </Link>
      </div>
    );
  }

  const onSay = (text: string) => (openQuestion ? go({ type: 'answer', entryId: openQuestion.id, answer: text }) : go({ type: 'say', text }));

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      <header className="sticky top-0 z-10 -mx-4 border-b-2 border-line bg-paper/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="btn-small -ml-3 text-brand hover:bg-brand-soft">
            ← {t.thing.back}
          </Link>
          <button
            type="button"
            onClick={() => archive.mutate({ id: thing.id, archived: thing.status !== 'archived' })}
            className="btn-small -mr-3 text-ink-soft hover:bg-sand"
          >
            {thing.status === 'archived' ? t.thing.unarchive : t.thing.archive}
          </button>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-ink">
          <span aria-hidden>{thing.emoji} </span>
          {thing.title}
        </h1>
        <p className="text-lg text-ink-soft" role="status" aria-live="polite">
          {busy ? t.thing.thinking : thing.statusLine || t.status[thing.status]}
        </p>
      </header>

      <div className="flex-1 space-y-4 py-5">
        {entries.map((e, i) =>
          e.kind === 'activity' && entries[i + 1]?.kind === 'activity' ? null : (
            <EntryView key={e.id} entry={e} act={act} isLatestCard={e.id === latestCardId} />
          ),
        )}
        {busy && (
          <div className="flex items-center gap-4">
            <div className="rounded-2xl rounded-bl-md bg-sand px-5 py-4 text-2xl leading-none text-ink-soft" aria-label={t.thing.thinking}>
              <span className="thinking-dot">●</span>
              <span className="thinking-dot [animation-delay:0.2s]"> ●</span>
              <span className="thinking-dot [animation-delay:0.4s]"> ●</span>
            </div>
            {thing.busy && (
              <button type="button" onClick={() => go({ type: 'stop' })} className="btn-small border-2 border-line bg-white text-ink">
                {t.thing.stop}
              </button>
            )}
          </div>
        )}
        {lastIsError && !busy && (
          <button type="button" onClick={() => go({ type: 'say', text: t.thing.retry })} className="btn-main">
            {t.thing.retry}
          </button>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-[5.2rem] z-10 -mx-4 bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:-mx-8 md:px-8">
        <Composer
          onSend={onSay}
          disabled={busy}
          focusKey={changeKey}
          placeholder={changeKey && !openQuestion ? t.thing.changePlaceholder : openQuestion ? t.thing.answerPlaceholder : t.thing.inputPlaceholder}
        />
      </div>

    </div>
  );
}
