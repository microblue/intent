import { useEffect, useState } from 'react';

/**
 * Reactive media query — pairs with Tailwind breakpoints when we need to
 * branch component shape (e.g. tabs vs panels), not just classNames.
 *
 * Conventions in this repo: prefer Tailwind responsive classes for everything
 * visual; reach for this hook only when the DOM shape itself changes
 * (different children, different state machine).
 */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatch(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return match;
}

/** Convenience: matches Tailwind's default `md` breakpoint (≥ 768px). */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
