import { useT } from '@/i18n';
import { useMemories } from '@/api/hooks';
import { Remembers } from './Me';

/** Memories get their own page, as in the original design. */
export function MemoryPage() {
  const t = useT();
  const { data: memories } = useMemories();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <span aria-hidden className="text-4xl leading-none">🧠</span>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            {t.memoryPage.title}
            {memories?.length ? <span className="ml-2 text-xl font-medium text-ink-soft">· {memories.length}</span> : null}
          </h1>
          <p className="text-lg text-ink-soft">{t.memoryPage.sub}</p>
        </div>
      </header>
      <div className="rounded-2xl bg-[oklch(95%_0.03_220)] p-5 ring-1 ring-[oklch(85%_0.06_220)]">
        <p className="text-lg font-semibold text-[oklch(38%_0.1_225)]">{t.memoryPage.aboutTitle}</p>
        <p className="mt-1 text-base text-ink">{t.memoryPage.about}</p>
      </div>
      <Remembers />
    </div>
  );
}
