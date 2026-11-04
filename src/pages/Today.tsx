import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { Thing } from '@shared/types';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useCreateThing, useProfile, useThings } from '@/api/hooks';
import { greetingKey, needsYou } from '@/lib/things';
import { Composer } from '@/components/Composer';
import { Tile, coverFor, timeAgo } from '@/components/look';

/** Home, in the original layout: greeting, what's waiting, ideas to try, your things as cards. */
export function TodayPage() {
  const t = useT();
  const { data: things, isLoading } = useThings();
  const { data: profile } = useProfile();
  const start = useStart();

  if (isLoading) return null;
  const active = (things ?? []).filter((x) => x.status !== 'archived');
  if (active.length === 0) return <Welcome />;

  const waiting = active.filter(needsYou);
  const hello = `${t.greeting[greetingKey()]}${profile?.name ? `${t.comma}${profile.name}` : ''}`;

  return (
    <div className="space-y-10">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-ink">
          {hello} <span aria-hidden>{greetingKey() === 'evening' ? '🌙' : '☀️'}</span>
        </h1>
        <p className="text-lg text-ink-soft">{t.today.summary(active.length, active[0].title)}</p>
      </header>

      {waiting.length > 0 && (
        <section aria-labelledby="needs-you" className="space-y-3">
          <h2 id="needs-you" className="text-xl font-bold text-ink">
            {t.today.needsYou} ({waiting.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {waiting.map((x) => (
              <Link key={x.id} to="/t/$id" params={{ id: x.id }} className="card grid grid-cols-[auto_1fr] items-start gap-4 p-4 !ring-2 !ring-wait-line transition hover:-translate-y-0.5 hover:shadow-lg">
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl shadow-sm" style={{ background: coverFor(x.id) }}>
                  {x.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-ink">{x.title}</span>
                  <span className="block text-base text-ink-soft">{x.statusLine}</span>
                  <span className="btn-small mt-3 min-h-[2.8rem] bg-brand text-white">{t.today.look} →</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="try-other" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="try-other" className="text-xl font-bold text-ink">{t.today.tryOther}</h2>
          <span className="hidden text-base text-ink-soft sm:block">{t.today.tryHint}</span>
        </div>
        <IdeaTiles onPick={start.go} disabled={start.busy} />
      </section>

      <section aria-labelledby="your-things" className="space-y-3">
        <h2 id="your-things" className="text-xl font-bold text-ink">{t.today.yourThings}</h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <NewCard />
          {active.filter((x) => !needsYou(x)).map((x) => (
            <ThingCard key={x.id} thing={x} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ThingCard({ thing }: { thing: Thing }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const line = thing.busy ? t.status.thinking : thing.statusLine || t.status[thing.status];
  const waiting = needsYou(thing);
  return (
    <Link to="/t/$id" params={{ id: thing.id }} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[5/2.6] overflow-hidden" style={{ background: coverFor(thing.id) }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
        <span aria-hidden className="absolute left-5 top-4 text-4xl drop-shadow-md transition group-hover:scale-110">
          {thing.emoji}
        </span>
        <span className="absolute bottom-3 left-3">
          {waiting ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(85%_0.14_80)] px-2.5 py-0.5 text-sm font-semibold text-[oklch(25%_0.05_70)] shadow-sm">
              <span aria-hidden>⚠️</span> {t.today.needsYou}
            </span>
          ) : thing.busy ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-0.5 text-sm font-semibold text-brand shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> {t.status.thinking}
            </span>
          ) : thing.status === 'done' ? (
            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-sm font-semibold text-ink shadow-sm">✓ {t.status.done}</span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-5">
        <h3 className="text-lg font-semibold leading-snug text-ink">{thing.title}</h3>
        <p className="line-clamp-2 text-base text-ink-soft">{line}</p>
        <p className="mt-auto pt-3 text-sm text-ink-soft">{timeAgo(thing.updatedAt, lang)}</p>
      </div>
    </Link>
  );
}

function NewCard() {
  const t = useT();
  return (
    <Link
      to="/new"
      className="group flex min-h-[14rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-white/40 p-6 text-center transition hover:border-brand/50 hover:bg-white"
    >
      <span aria-hidden className="grid h-14 w-14 place-items-center rounded-2xl bg-sand text-2xl transition group-hover:bg-brand-soft">✨</span>
      <span>
        <span className="block text-lg font-semibold text-ink">{t.today.newCard}</span>
        <span className="block text-base text-ink-soft">{t.today.newCardSub}</span>
      </span>
    </Link>
  );
}

/** The original "try something" grid: gradient icon tile, short title, one-line description. */
export function IdeaTiles({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {t.examples.map((ex, i) => (
        <button
          key={ex.text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(ex.text)}
          className="card flex flex-col items-start gap-2.5 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
        >
          <Tile emoji={ex.emoji} index={i} />
          <span className="text-lg font-semibold text-ink">{ex.group}</span>
          <span className="line-clamp-2 text-base leading-snug text-ink-soft">{ex.text}</span>
        </button>
      ))}
    </div>
  );
}

function useStart() {
  const t = useT();
  const nav = useNavigate();
  const create = useCreateThing();
  return {
    busy: create.isPending,
    go: (text: string) =>
      create.mutate(text, {
        onSuccess: (thing) => nav({ to: '/t/$id', params: { id: thing.id } }),
        onError: () => toast.error(t.errors.network),
      }),
  };
}

/** First use: no sign-up, one sentence is enough. */
function Welcome() {
  const t = useT();
  const start = useStart();
  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-2">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t.welcome.hello}</h1>
        <p className="text-lg text-ink-soft">{t.welcome.ask}</p>
      </header>
      <Composer variant="hero" onSend={start.go} disabled={start.busy} sendLabel={t.say.start} placeholder={t.say.placeholder} />
      <section className="space-y-3">
        <p className="text-lg font-semibold text-ink">{t.welcome.orTry}</p>
        <IdeaTiles onPick={start.go} disabled={start.busy} />
      </section>
      <p className="rounded-2xl bg-brand-soft p-4 text-base text-ink">{t.welcome.promise}</p>
    </div>
  );
}
