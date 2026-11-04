import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useT } from '@/i18n';
import { useCreateThing } from '@/api/hooks';
import { Composer } from '@/components/Composer';

/** "What would you like to do?" — the original new-intent page. */
export function NewThingPage() {
  const t = useT();
  const nav = useNavigate();
  const create = useCreateThing();
  const start = (text: string) =>
    create.mutate(text, {
      onSuccess: (thing) => nav({ to: '/t/$id', params: { id: thing.id } }),
      onError: () => toast.error(t.errors.network),
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t.say.title}</h1>
        <p className="text-lg text-ink-soft">{t.say.subtitle}</p>
      </header>
      <Composer variant="hero" onSend={start} disabled={create.isPending} sendLabel={t.say.start} placeholder={t.say.placeholder} autoFocus />
      <section className="space-y-3">
        <p className="text-base font-medium text-ink-soft">{t.say.examplesTitle}</p>
        <Examples onPick={start} disabled={create.isPending} />
      </section>
    </div>
  );
}

/** Rounded chips, as in the original. */
export function Examples({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2.5">
      {t.examples.map((ex) => (
        <button
          key={ex.text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(ex.text)}
          className="inline-flex min-h-[2.8rem] items-center gap-2 rounded-full bg-white px-4 py-1.5 text-left text-base text-ink shadow-sm ring-1 ring-line transition hover:bg-brand-soft hover:ring-brand/40 disabled:opacity-60"
        >
          <span aria-hidden className="text-lg">{ex.emoji}</span>
          <span>{ex.text}</span>
        </button>
      ))}
    </div>
  );
}
