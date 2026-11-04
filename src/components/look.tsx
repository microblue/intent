/** Visual helpers carried over from the original design: logo, cover gradients, icon tiles. */

/** The original arc mark with the "intent" wordmark. */
export function Logo({ compact = false, tagline }: { compact?: boolean; tagline?: string }) {
  return (
    <span className="group flex items-center gap-3">
      <span aria-hidden className="relative grid h-10 w-10 shrink-0 place-items-center">
        <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[oklch(70%_0.18_292/0.35)] via-[oklch(70%_0.13_210/0.3)] to-[oklch(80%_0.14_75/0.35)] opacity-80 blur-[3px] transition-opacity group-hover:opacity-100" />
        <svg viewBox="0 0 32 32" className="relative h-7 w-7" fill="none">
          <defs>
            <linearGradient id="intent-stroke" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="oklch(62% 0.2 292)" />
              <stop offset="55%" stopColor="oklch(60% 0.14 220)" />
              <stop offset="100%" stopColor="oklch(74% 0.15 75)" />
            </linearGradient>
          </defs>
          <path d="M5.5 21.5C8.5 13.5 13 8.5 20 5.5" stroke="url(#intent-stroke)" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
          <path d="M8.5 25C12.5 16.5 17.5 11.5 26 8.5" stroke="url(#intent-stroke)" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
          <path d="M13 28.5C17 21 21 16 28 13.5" stroke="url(#intent-stroke)" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="27.5" cy="11" r="1.6" fill="oklch(74% 0.15 75)" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.3rem] font-bold tracking-tight">
            <span className="text-ink">in</span>
            <span className="text-signature">tent</span>
          </span>
          {tagline && <span className="mt-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">{tagline}</span>}
        </span>
      )}
    </span>
  );
}

const COVERS = [
  'linear-gradient(135deg, oklch(78% 0.15 350), oklch(72% 0.13 290))',
  'linear-gradient(135deg, oklch(76% 0.13 140), oklch(72% 0.13 200))',
  'linear-gradient(135deg, oklch(75% 0.13 80), oklch(72% 0.13 30))',
  'linear-gradient(135deg, oklch(72% 0.16 290), oklch(70% 0.13 220))',
  'linear-gradient(135deg, oklch(78% 0.13 350), oklch(72% 0.14 30))',
  'linear-gradient(135deg, oklch(70% 0.13 260), oklch(72% 0.12 200))',
  'linear-gradient(135deg, oklch(74% 0.1 50), oklch(70% 0.12 20))',
];

/** A stable cover gradient for a task, picked from its id. */
export function coverFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length];
}

const TILES = [
  'linear-gradient(135deg, oklch(72% 0.15 230), oklch(66% 0.17 265))',
  'linear-gradient(135deg, oklch(78% 0.13 340), oklch(70% 0.16 300))',
  'linear-gradient(135deg, oklch(72% 0.12 245), oklch(72% 0.12 200))',
  'linear-gradient(135deg, oklch(74% 0.14 155), oklch(68% 0.12 200))',
  'linear-gradient(135deg, oklch(78% 0.13 45), oklch(70% 0.15 25))',
  'linear-gradient(135deg, oklch(76% 0.13 65), oklch(68% 0.15 35))',
];

/** Rounded gradient square holding an emoji — the original "app icon" tiles. */
export function Tile({ emoji, index = 0, size = 'md' }: { emoji: string; index?: number; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-14 w-14 text-3xl' : size === 'md' ? 'h-12 w-12 text-2xl' : 'h-10 w-10 text-xl';
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-2xl shadow-sm ${dim}`} style={{ background: TILES[index % TILES.length] }}>
      {emoji}
    </span>
  );
}

export function timeAgo(iso: string, lang: 'zh' | 'en'): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (lang === 'en') {
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return `${Math.round(s / 86400)} 天前`;
}
