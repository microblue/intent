import { create } from 'zustand';
import type { Lang } from '@shared/types';

/**
 * Display preferences cached locally so the first paint is already right.
 * The server profile is the source of truth; it is synced on load.
 */
interface Prefs {
  lang: Lang;
  fontScale: 1 | 2 | 3;
  set: (p: Partial<Pick<Prefs, 'lang' | 'fontScale'>>) => void;
}

const KEY = 'intent.prefs';

function load(): Pick<Prefs, 'lang' | 'fontScale'> {
  const fallbackLang: Lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { lang: s.lang === 'en' || s.lang === 'zh' ? s.lang : fallbackLang, fontScale: [1, 2, 3].includes(s.fontScale) ? s.fontScale : 1 };
  } catch {
    return { lang: fallbackLang, fontScale: 1 };
  }
}

function apply(p: Pick<Prefs, 'lang' | 'fontScale'>) {
  document.documentElement.dataset.size = String(p.fontScale);
  document.documentElement.lang = p.lang === 'zh' ? 'zh-CN' : 'en';
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: preferences just won't persist locally */
  }
}

export const usePrefs = create<Prefs>((set, get) => {
  const initial = load();
  apply(initial);
  return {
    ...initial,
    set: (p) => {
      set(p);
      const { lang, fontScale } = get();
      apply({ lang, fontScale });
    },
  };
});
