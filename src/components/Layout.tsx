import { RuntimeStatus } from './RuntimeStatus';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useT } from '@/i18n';
import { useLiveUpdates, useProfile, useThings, useUpdateProfile } from '@/api/hooks';
import { usePrefs } from '@/state/prefs';
import { needsYou } from '@/lib/things';

/**
 * Three places only: Today, New, Me (spec §4).
 * Phone: bottom bar with a raised centre button. Desktop: a narrow left rail.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: things } = useThings();
  const waiting = (things ?? []).filter(needsYou).length;
  useSyncProfile();
  useLiveUpdates();

  const items = [
    { to: '/', label: t.nav.today, icon: '☀️', active: path === '/' || path.startsWith('/t/'), badge: waiting },
    { to: '/new', label: t.nav.say, icon: '＋', active: path === '/new', primary: true },
    { to: '/me', label: t.nav.me, icon: '👤', active: path.startsWith('/me') },
  ] as const;

  return (
    <div className="min-h-screen md:flex">
      <nav aria-label="Intent" className="sticky top-0 hidden h-screen w-[11rem] shrink-0 flex-col gap-2 border-r-2 border-line bg-sand p-4 md:flex">
        <Link to="/" className="mb-4 px-3 text-2xl font-bold tracking-tight text-brand">
          Intent
        </Link>
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            aria-current={it.active ? 'page' : undefined}
            className={`btn-small min-h-[3rem] justify-start text-lg ${
              'primary' in it ? 'bg-brand text-white hover:bg-[#174a3a]' : it.active ? 'bg-white font-bold text-ink' : 'text-ink hover:bg-white'
            }`}
          >
            <span aria-hidden>{it.icon}</span>
            {it.label}
            {'badge' in it && it.badge > 0 && <Badge n={it.badge} />}
          </Link>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-3xl px-4 pb-[7rem] pt-5 md:px-8 md:pb-10 md:pt-8"><RuntimeStatus />{children}</main>

      <nav
        aria-label="Intent"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 items-end border-t-2 border-line bg-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 md:hidden"
      >
        {items.map((it) =>
          'primary' in it ? (
            <Link key={it.to} to={it.to} className="-mt-6 flex flex-col items-center gap-1" aria-current={it.active ? 'page' : undefined}>
              <span aria-hidden className="flex h-[3.2rem] w-[3.2rem] items-center justify-center rounded-full bg-brand text-2xl text-white shadow-lg">
                ＋
              </span>
              <span className="text-base font-semibold text-brand">{it.label}</span>
            </Link>
          ) : (
            <Link
              key={it.to}
              to={it.to}
              aria-current={it.active ? 'page' : undefined}
              className={`relative flex min-h-[3.2rem] flex-col items-center justify-center rounded-xl text-base ${it.active ? 'font-bold text-ink' : 'text-ink-soft'}`}
            >
              <span aria-hidden className="text-xl">
                {it.icon}
              </span>
              {it.label}
              {'badge' in it && it.badge > 0 && (
                <span className="absolute right-[22%] top-0">
                  <Badge n={it.badge} />
                </span>
              )}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}

function Badge({ n }: { n: number }) {
  return <span className="ml-auto inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-danger px-1.5 text-base font-bold leading-6 text-white">{n}</span>;
}

/** Keep local display prefs and the server profile in step; tell the server where the user is. */
function useSyncProfile() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const prefs = usePrefs();
  useEffect(() => {
    if (!profile) return;
    const patch: Record<string, unknown> = {};
    // A brand-new profile adopts what the browser already shows.
    if (profile.lang !== prefs.lang) patch.lang = prefs.lang;
    if (profile.fontScale !== prefs.fontScale) patch.fontScale = prefs.fontScale;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!profile.timezone && tz) patch.timezone = tz;
    // Location comes from the timezone, never from the language: a Chinese
    // browser in California still says zh-CN.
    if (Object.keys(patch).length) update.mutate(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.userId]);
}
