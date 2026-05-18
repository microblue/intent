import { Link } from '@tanstack/react-router';
import { TERMS, type TermKey } from '@/lib/terms';

export function PageHeader({
  title,
  subtitle,
  emoji,
  term,
}: {
  title: string;
  subtitle?: string;
  emoji?: string;
  /**
   * If this page corresponds to a core concept, pass its key. The English
   * term name renders next to the title as muted secondary text — keeps the
   * 友好词 · English pairing visible everywhere the concept is named.
   */
  term?: TermKey;
}) {
  const secondary = term ? TERMS[term].en : undefined;

  return (
    <header className="mb-8 flex items-start gap-4">
      <Link
        to="/"
        className="mt-1.5 rounded-lg p-1.5 text-base-content/55 hover:bg-base-200 hover:text-base-content"
        aria-label="返回首页"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
      <div className="flex-1">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight">
          {emoji && <span aria-hidden>{emoji}</span>}
          <span>{title}</span>
          {secondary && (
            <span className="text-sm font-normal uppercase tracking-wider text-base-content/40">
              · {secondary}
            </span>
          )}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-base-content/60">{subtitle}</p>}
      </div>
    </header>
  );
}
