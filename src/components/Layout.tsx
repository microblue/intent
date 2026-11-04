import { RuntimeStatus } from './RuntimeStatus';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useT } from '@/i18n';
import { useAccount, useLiveUpdates, useProfile, useThings, useUpdateProfile } from '@/api/hooks';
import { usePrefs } from '@/state/prefs';
import { needsYou } from '@/lib/things';
import { Logo, coverFor } from './look';

/**
 * The original shell: a sidebar on desktop (logo, gradient "new" button,
 * icon-tile navigation, recent things, account) and a bottom dock with a
 * raised centre button on phones.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: things } = useThings();
  const waiting = (things ?? []).filter(needsYou).length;
  useSyncProfile();
  useLiveUpdates();

  const nav = [
    { to: '/', label: t.nav.today, icon: '✶', tint: 'bg-[oklch(93%_0.04_290)] text-brand', active: path === '/' || path.startsWith('/t/'), badge: waiting },
    { to: '/memory', label: t.nav.memory, icon: '🧠', tint: 'bg-[oklch(93%_0.05_75)]', active: path.startsWith('/memory'), badge: 0 },
    { to: '/me', label: t.nav.me, icon: '👤', tint: 'bg-[oklch(93%_0.04_200)]', active: path.startsWith('/me'), badge: 0 },
  ] as const;

  return (
    <div className="min-h-screen md:flex">
      <Sidebar nav={nav} path={path} />

      <main className="mx-auto w-full max-w-5xl px-4 pb-[7rem] pt-6 md:px-10 md:pb-12 md:pt-10">
        <RuntimeStatus />
        {children}
      </main>

      <BottomDock nav={nav} newActive={path === '/new'} />
    </div>
  );
}

type NavItem = { to: string; label: string; icon: string; tint: string; active: boolean; badge: number };

function Sidebar({ nav, path }: { nav: readonly NavItem[]; path: string }) {
  const t = useT();
  const { data: things } = useThings();
  const { data: account } = useAccount();
  const recent = (things ?? []).filter((x) => x.status !== 'archived').slice(0, 5);

  return (
    <aside aria-label="Intent" className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-line bg-sand md:flex">
      <div className="flex h-[4.5rem] shrink-0 items-center border-b border-line/70 px-5">
        <Link to="/" aria-label="Intent">
          <Logo />
        </Link>
      </div>

      <div className="px-4 pt-4">
        <Link
          to="/new"
          aria-current={path === '/new' ? 'page' : undefined}
          className="bg-signature group flex items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-[0_8px_24px_-8px_oklch(55%_0.2_292/0.55)] transition hover:brightness-110"
        >
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20 text-2xl">✨</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-lg font-semibold">{t.nav.newTitle}</span>
            <span className="block text-sm text-white/85">{t.nav.newSub}</span>
          </span>
          <span aria-hidden className="text-2xl transition group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      <nav aria-label={t.nav.browse} className="mt-5 px-3">
        <p className="px-2 pb-1.5 text-sm font-semibold text-ink-soft">{t.nav.browse}</p>
        <ul className="space-y-1">
          {nav.map((it) => (
            <li key={it.to}>
              <Link
                to={it.to}
                aria-current={it.active ? 'page' : undefined}
                className={`relative flex min-h-[3.4rem] items-center gap-3 rounded-2xl px-2 py-1.5 text-lg transition ${
                  it.active ? 'bg-white font-semibold text-ink shadow-sm ring-1 ring-line/70' : 'text-ink hover:bg-white/70'
                }`}
              >
                {it.active && <span aria-hidden className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-brand" />}
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl ${it.tint}`}>{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {it.badge > 0 && <Badge n={it.badge} />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {recent.length > 0 && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="px-2 pb-1.5 text-sm font-semibold text-ink-soft">{t.nav.recent}</p>
          <ul className="space-y-0.5">
            {recent.map((x) => (
              <li key={x.id}>
                <Link
                  to="/t/$id"
                  params={{ id: x.id }}
                  className={`flex items-center gap-3 rounded-xl px-2 py-2 transition ${path === `/t/${x.id}` ? 'bg-white shadow-sm' : 'hover:bg-white/70'}`}
                >
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg shadow-sm" style={{ background: coverFor(x.id) }}>
                    {x.emoji}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-base font-medium text-ink">{x.title}</span>
                    <span className="block truncate text-sm text-ink-soft">{x.busy ? t.status.thinking : t.status[x.status]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recent.length === 0 && <div className="flex-1" />}

      <Link to="/me" className="m-3 flex items-center gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-line/60 transition hover:bg-white">
        <span aria-hidden className="bg-signature grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold text-white">
          {account?.username ? account.username.slice(0, 1).toUpperCase() : '?'}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-base font-semibold text-ink">{account?.username ?? t.nav.guest}</span>
          <span className="block truncate text-sm text-ink-soft">{account?.username ? t.nav.signedIn : t.nav.guestSub}</span>
        </span>
        {!account?.username && <span className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">{t.nav.setUp}</span>}
      </Link>
    </aside>
  );
}

function BottomDock({ nav, newActive }: { nav: readonly NavItem[]; newActive: boolean }) {
  const t = useT();
  const [first, ...rest] = nav;
  const item = (it: NavItem) => (
    <Link
      key={it.to}
      to={it.to}
      aria-current={it.active ? 'page' : undefined}
      className={`relative flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 rounded-xl text-sm ${it.active ? 'font-semibold text-brand' : 'text-ink-soft'}`}
    >
      <span aria-hidden className="text-xl leading-none">{it.icon}</span>
      {it.label}
      {it.badge > 0 && (
        <span className="absolute right-[18%] top-0">
          <Badge n={it.badge} />
        </span>
      )}
    </Link>
  );
  return (
    <nav
      aria-label="Intent"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 items-end border-t border-line bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden"
    >
      {item(first)}
      <Link to="/new" aria-current={newActive ? 'page' : undefined} className="-mt-7 flex flex-col items-center gap-1">
        <span aria-hidden className="bg-signature grid h-[3.6rem] w-[3.6rem] place-items-center rounded-full text-2xl text-white shadow-[0_8px_20px_-6px_oklch(55%_0.2_292/0.6)] ring-4 ring-white">
          ✨
        </span>
        <span className="text-sm font-semibold text-brand">{t.nav.say}</span>
      </Link>
      {rest.map(item)}
    </nav>
  );
}

function Badge({ n }: { n: number }) {
  return <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-danger px-1.5 text-sm font-bold leading-6 text-white">{n}</span>;
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
