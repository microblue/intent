import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useT } from '@/i18n';
import { useCreateThing } from '@/api/hooks';
import { Composer } from '@/components/Composer';

/** Say something new: microphone first, then typing, then examples (spec §5.2). */
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
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t.say.title}</h1>
      <Composer variant="hero" onSend={start} disabled={create.isPending} sendLabel={t.say.start} placeholder={t.say.placeholder} autoFocus />
      <div className="space-y-3">
        <p className="text-lg text-ink-soft">{t.say.examplesTitle}</p>
        <Examples onPick={start} disabled={create.isPending} />
      </div>
    </div>
  );
}

export function Examples({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {t.examples.map((ex) => (
        <button key={ex.text} type="button" disabled={disabled} onClick={() => onPick(ex.text)} className="btn-soft min-h-[3.6rem] justify-start py-2 text-left">
          <span aria-hidden className="text-2xl">
            {ex.emoji}
          </span>
          <span className="text-lg font-medium leading-snug">{ex.text}</span>
        </button>
      ))}
    </div>
  );
}
