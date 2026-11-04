import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { Thing } from '@shared/types';
import { useT } from '@/i18n';
import { useCreateThing, useProfile, useThings } from '@/api/hooks';
import { greetingKey, needsYou } from '@/lib/things';
import { Composer } from '@/components/Composer';
import { Examples } from './NewThing';

/** Home: what's waiting for you, then your things, then "say something new" (spec §5.1). */
export function TodayPage() {
  const t = useT();
  const { data: things, isLoading } = useThings();
  const { data: profile } = useProfile();

  if (isLoading) return null;
  const active = (things ?? []).filter((x) => x.status !== 'archived');
  if (active.length === 0) return <Welcome />;

  const waiting = active.filter(needsYou);
  const rest = active.filter((x) => !needsYou(x));
  const hello = `${t.greeting[greetingKey()]}${profile?.name ? `${t.comma}${profile.name}` : ''}`;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-ink">{hello}</h1>

      {waiting.length > 0 && (
        <section aria-labelledby="needs-you" className="space-y-3">
          <h2 id="needs-you" className="text-xl font-bold text-ink">
            {t.today.needsYou} ({waiting.length})
          </h2>
          {waiting.map((x) => (
            <Link key={x.id} to="/t/$id" params={{ id: x.id }} className="block rounded-3xl border-2 border-wait-line bg-wait p-5 hover:brightness-[0.98]">
              <p className="text-xl font-bold text-ink">
                <span aria-hidden>{x.emoji} </span>
                {x.title}
              </p>
              <p className="mt-1 text-lg text-ink">{x.statusLine}</p>
              <span className="btn-main mt-4">{t.today.look}</span>
            </Link>
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="your-things" className="space-y-3">
          <h2 id="your-things" className="text-xl font-bold text-ink">
            {t.today.yourThings}
          </h2>
          <ul className="divide-y-2 divide-line overflow-hidden rounded-3xl border-2 border-line bg-white">
            {rest.map((x) => (
              <ThingRow key={x.id} thing={x} />
            ))}
          </ul>
        </section>
      )}

      <Link to="/new" className="btn-main w-full min-h-[4rem] text-xl">
        <span aria-hidden>🎤</span> {t.today.sayNew}
      </Link>
    </div>
  );
}

function ThingRow({ thing }: { thing: Thing }) {
  const t = useT();
  const line = thing.busy ? t.status.thinking : thing.statusLine || t.status[thing.status];
  return (
    <li>
      <Link to="/t/$id" params={{ id: thing.id }} className="flex min-h-[4rem] items-start gap-4 px-5 py-4 hover:bg-sand">
        <span aria-hidden className="pt-0.5 text-2xl">
          {thing.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold text-ink">{thing.title}</span>
          <span className="line-clamp-2 text-base text-ink-soft">{line}</span>
          {thing.status === 'done' && <span className="btn-small mt-2 bg-brand-soft text-brand">{t.today.seeResult}</span>}
        </span>
      </Link>
    </li>
  );
}

/** First use: no sign-up, one sentence is enough (spec §6.1). */
function Welcome() {
  const t = useT();
  const nav = useNavigate();
  const create = useCreateThing();
  const start = (text: string) =>
    create.mutate(text, {
      onSuccess: (thing) => nav({ to: '/t/$id', params: { id: thing.id } }),
      onError: () => toast.error(t.errors.network),
    });
  return (
    <div className="mx-auto max-w-xl space-y-6 pt-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-ink">{t.welcome.hello}</h1>
        <p className="text-xl text-ink">{t.welcome.ask}</p>
      </div>
      <Composer variant="hero" onSend={start} disabled={create.isPending} sendLabel={t.say.start} placeholder={t.say.placeholder} />
      <div className="space-y-3">
        <p className="text-lg text-ink-soft">{t.welcome.orTry}</p>
        <Examples onPick={start} disabled={create.isPending} />
      </div>
      <p className="rounded-2xl bg-sand p-4 text-base text-ink-soft">{t.welcome.promise}</p>
    </div>
  );
}
