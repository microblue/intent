import { Link, useRouterState } from '@tanstack/react-router';
import { sortedIntents, pendingApprovalCount } from '@/mocks';
import { useSession } from '@/lib/auth';
import { useUI } from '@/state/ui';
import { cn } from '@/lib/cn';

/**
 * Desktop / laptop persistent sidebar.
 *
 * Visual rhythm (the previous version drifted on icon sizes / baselines /
 * type scale, so we're explicit about every constraint here):
 *
 *   Width                288px (w-72) — fits 5–6 Chinese chars + Latin hint
 *   Vertical sections    Brand / Hero CTA / Nav / Recents / Account
 *                        Each separated by a 1px line + uppercase label
 *   Icon container       36×36 rounded-xl (fixed) — Unicode glyphs and
 *                        emojis vary wildly in advance width if you let
 *                        them flow inline, so we anchor every glyph
 *                        inside a fixed grid cell. This is the #1 fix
 *                        for "logos have different sizes" feedback.
 *   Nav row height       48px — comfortable hit target, readable Chinese
 *   Type scale           label text-[15px] / EN hint text-[11px] uppercase
 *                        / recent title text-[14px] / preview text-[12px]
 *   Active state         bg-base-100 + 2px primary left bar (clear from
 *                        plain hover which is bg-base-100/60)
 */
export function Sidebar({ collapsed = false }: { collapsed?: boolean } = {}) {
  const recent = sortedIntents().slice(0, 5);
  const pending = pendingApprovalCount();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const openLauncher = useUI((s) => s.setLauncherOpen);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iP(hone|od|ad)/.test(navigator.platform);

  const isActive = (target: string) => path === target;
  const isIntentActive = (id: string) => path === `/intent/${id}`;

  if (collapsed) {
    return (
      <CollapsedSidebar
        recent={recent}
        pending={pending}
        isActive={isActive}
        isIntentActive={isIntentActive}
        onExpand={toggleSidebar}
        onOpenLauncher={() => openLauncher(true)}
      />
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-base-300/60 bg-base-200">
      {/* ─── 1. Brand ───────────────────────────────────────────
          Custom mark + duotone wordmark.
            • Mark: three concentric arc-strokes suggesting claw scratches
              that also read as AI signal-spread. Gradient-stroked + soft
              halo glow behind for depth.
            • Wordmark: "my" in base content color, "claw" in the same
              gradient as the mark — typographic duotone, so the brand has
              a single chromatic identity from glyph to letterform.
            • Tagline: "PERSONAL AI OS" in tracked-out uppercase as the
              secondary line. No more rectangular pill — it was reading
              as a release tag, not a tagline.
       */}
      <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-base-300/40 px-4">
      <Link
        to="/"
        className="group flex flex-1 items-center gap-3"
      >
        <span aria-hidden className="relative grid h-10 w-10 shrink-0 place-items-center">
          <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/35 via-secondary/30 to-accent/35 opacity-70 blur-[3px] transition-opacity group-hover:opacity-100" />
          <svg viewBox="0 0 32 32" className="relative h-7 w-7" fill="none">
            <defs>
              <linearGradient id="myclaw-stroke" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="oklch(78% 0.18 295)" />
                <stop offset="55%" stopColor="oklch(72% 0.16 235)" />
                <stop offset="100%" stopColor="oklch(82% 0.15 80)" />
              </linearGradient>
            </defs>
            <path
              d="M5.5 21.5C8.5 13.5 13 8.5 20 5.5"
              stroke="url(#myclaw-stroke)"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path
              d="M8.5 25C12.5 16.5 17.5 11.5 26 8.5"
              stroke="url(#myclaw-stroke)"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M13 28.5C17 21 21 16 28 13.5"
              stroke="url(#myclaw-stroke)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="27.5" cy="11" r="1.6" fill="oklch(82% 0.15 80)" />
          </svg>
        </span>
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-tight" style={{ fontSize: '1.15rem' }}>
            <span className="text-base-content">my</span>
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              claw
            </span>
          </span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-base-content/45">
            Personal AI OS
          </span>
        </div>
      </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="btn btn-circle btn-ghost btn-xs"
          aria-label="收起侧栏"
          title="收起侧栏"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* ─── 2. Search (was a top-bar before; lives here now) ─── */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => openLauncher(true)}
          aria-label="搜索"
          className="flex h-10 w-full items-center gap-2.5 rounded-xl bg-base-100/60 px-3 text-left text-[14px] text-base-content/55 ring-1 ring-base-300/40 transition hover:bg-base-100 hover:text-base-content/80"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 opacity-70"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <span className="flex-1 truncate">搜一下…</span>
          <kbd className="kbd kbd-xs text-[0.7rem] opacity-60">
            {isMac ? '⌘ K' : '^ K'}
          </kbd>
        </button>
      </div>

      {/* ─── 3. Hero CTA ──────────────────────────────────────── */}
      <div className="px-3 pt-3">
        <Link
          to="/new"
          search={{ seed: undefined }}
          className="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent p-3.5 text-primary-content shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/35"
        >
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20 text-2xl backdrop-blur-sm transition group-hover:scale-110 group-hover:rotate-6"
          >
            ✨
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-tight">新想做的事</div>
            <div className="text-[11px] opacity-90">一句话告诉我</div>
          </div>
          <span className="text-xl opacity-80 transition group-hover:translate-x-0.5">
            →
          </span>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 transition group-hover:opacity-100" />
        </Link>
      </div>

      {/* ─── 3. Primary nav ───────────────────────────────────── */}
      <SectionHeader zh="浏览" />
      <nav className="flex flex-col gap-1 px-2">
        <NavItem to="/" active={isActive('/')} glyph="✶" label="想做的事" tint="primary" />
        <NavItem to="/schedule" active={isActive('/schedule')} glyph="🔔" label="提醒" tint="warning" />
        <NavItem
          to="/now"
          active={isActive('/now')}
          glyph="🛎"
          label="正在做的事"
          tint="info"
          badge={pending > 0 ? pending : undefined}
        />
        <NavItem to="/memory" active={isActive('/memory')} glyph="🧠" label="记得的事" tint="accent" />
        <NavItem to="/help" active={isActive('/help')} glyph="📖" label="帮助" tint="success" />
      </nav>

      {/* ─── 4. Recent intents ────────────────────────────────── */}
      {recent.length === 0 ? (
        // Cold-start: don't render an empty section header + scroll area.
        // The hero CTA above already invites the user to start something.
        <div className="flex-1" />
      ) : (
        <>
      <SectionHeader zh="最近" className="mt-5" />
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {recent.map((it) => (
          <li key={it.id}>
            <Link
              to="/intent/$intentId"
              params={{ intentId: it.id }}
              className={cn(
                'group relative flex items-center gap-3 overflow-hidden rounded-xl px-2 py-2 transition',
                isIntentActive(it.id)
                  ? 'bg-base-100 shadow-sm'
                  : 'hover:bg-base-100/60',
              )}
            >
              {isIntentActive(it.id) && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
                />
              )}
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg shadow-sm ring-1 ring-black/5"
                style={{ background: it.cover }}
              >
                {it.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-medium leading-tight">
                    {it.title}
                  </span>
                  {it.lifecycle === 'pinned' && (
                    <span aria-label="置顶" className="text-[10px] opacity-50">
                      📌
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[12px] leading-tight text-base-content/50">
                  {it.preview}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
        </>
      )}

      {/* ─── 5. Account footer ────────────────────────────────── */}
      <AccountFooter />
    </aside>
  );
}

function AccountFooter() {
  const { user, signedIn } = useSession();

  if (!signedIn) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-t border-base-300/50 px-3 py-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-base-300/60 text-sm font-bold text-base-content/55"
        >
          ?
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-tight">未登录</div>
          <div className="mt-0.5 text-[12px] leading-tight text-base-content/55">
            演示模式 · 数据不保存
          </div>
        </div>
        <Link to="/auth/signin" className="btn btn-primary btn-xs">
          登录
        </Link>
      </div>
    );
  }

  const initial = (user?.email?.[0] ?? 'D').toUpperCase();
  return (
    <Link
      to="/settings"
      className="flex shrink-0 items-center gap-3 border-t border-base-300/50 px-3 py-3 transition hover:bg-base-100/60"
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-content shadow-sm"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium leading-tight">
          {user?.email?.split('@')[0] ?? '已登录'}
        </div>
        <div className="mt-0.5 truncate text-[12px] leading-tight text-base-content/55">
          {user?.email}
        </div>
      </div>
      <span aria-hidden className="text-base text-base-content/40">
        ⚙
      </span>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function SectionHeader({
  zh,
  className,
}: {
  zh: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-4 pb-1.5 pt-3 text-[11px] font-semibold tracking-wide text-base-content/45',
        className,
      )}
    >
      {zh}
    </div>
  );
}

type NavTint = 'primary' | 'warning' | 'info' | 'accent' | 'success';

/**
 * Per-item icon tint. Each entry has two paired classes:
 *   idle     — softly tinted background + readable foreground
 *   active   — saturated tint + ring + soft shadow, the chip "lights up"
 * Using DaisyUI semantic colors so the palette flips correctly under
 * aios-light / aios-dark themes.
 */
const NAV_TINT: Record<NavTint, { idle: string; active: string }> = {
  primary: {
    idle: 'bg-primary/12 text-primary',
    active: 'bg-primary text-primary-content shadow-md shadow-primary/30',
  },
  warning: {
    idle: 'bg-warning/15 text-warning-content',
    active: 'bg-warning text-warning-content shadow-md shadow-warning/30',
  },
  info: {
    idle: 'bg-info/15 text-info-content',
    active: 'bg-info text-info-content shadow-md shadow-info/30',
  },
  accent: {
    idle: 'bg-accent/15 text-accent-content',
    active: 'bg-accent text-accent-content shadow-md shadow-accent/30',
  },
  success: {
    idle: 'bg-success/15 text-success-content',
    active: 'bg-success text-success-content shadow-md shadow-success/30',
  },
};

function NavItem({
  to,
  active,
  glyph,
  label,
  badge,
  tint,
}: {
  to: string;
  active: boolean;
  glyph: string;
  label: string;
  badge?: number;
  tint: NavTint;
}) {
  const t = NAV_TINT[tint];
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex h-14 items-center gap-3 rounded-2xl px-2 transition',
        active ? 'bg-base-100 shadow-sm' : 'hover:bg-base-100/60',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl leading-none transition',
          active ? t.active : t.idle,
          !active && 'group-hover:scale-105',
        )}
      >
        {glyph}
      </span>
      <span
        className={cn(
          'flex-1 truncate text-[15px] font-medium leading-tight',
          active ? 'text-base-content' : 'text-base-content/85',
        )}
      >
        {label}
      </span>
      {badge !== undefined && (
        <span className="badge badge-error badge-sm font-semibold">{badge}</span>
      )}
    </Link>
  );
}

/* ────────── Collapsed (narrow icon rail) variant ──────────
   Width: ~64px (set by the parent Panel's collapsedSize). Shows just the
   essentials as icons with title-attribute tooltips. The earlier
   "completely hidden + floating peek button" design was overlapping the
   chat header's back arrow; keeping a narrow rail avoids that collision
   and gives users one-click access to nav without needing to expand. */
function CollapsedSidebar({
  recent,
  pending,
  isActive,
  isIntentActive,
  onExpand,
  onOpenLauncher,
}: {
  recent: ReturnType<typeof sortedIntents>;
  pending: number;
  isActive: (p: string) => boolean;
  isIntentActive: (id: string) => boolean;
  onExpand: () => void;
  onOpenLauncher: () => void;
}) {
  return (
    <aside className="flex h-full w-full flex-col items-center gap-1 border-r border-base-300/60 bg-base-200 py-3">
      <button
        type="button"
        onClick={onExpand}
        className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-base-100/60"
        aria-label="展开侧栏"
        title="展开侧栏"
      >
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
          <defs>
            <linearGradient id="brand-stroke-mini" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="oklch(78% 0.18 295)" />
              <stop offset="55%" stopColor="oklch(72% 0.16 235)" />
              <stop offset="100%" stopColor="oklch(82% 0.15 80)" />
            </linearGradient>
          </defs>
          <path d="M5.5 21.5C8.5 13.5 13 8.5 20 5.5" stroke="url(#brand-stroke-mini)" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
          <path d="M8.5 25C12.5 16.5 17.5 11.5 26 8.5" stroke="url(#brand-stroke-mini)" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
          <path d="M13 28.5C17 21 21 16 28 13.5" stroke="url(#brand-stroke-mini)" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="27.5" cy="11" r="1.6" fill="oklch(82% 0.15 80)" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onOpenLauncher}
        className="grid h-10 w-10 place-items-center rounded-xl text-base-content/70 transition hover:bg-base-100/60"
        aria-label="搜索"
        title="搜索 (⌘K)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
      </button>

      <Link
        to="/new"
        search={{ seed: undefined }}
        className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary via-secondary to-accent text-lg text-primary-content shadow-md shadow-primary/25 transition hover:-translate-y-0.5"
        title="新想做的事"
      >
        <span aria-hidden>✨</span>
      </Link>

      <div className="my-1 h-px w-8 bg-base-300/60" />

      <MiniNavItem to="/" active={isActive('/')} glyph="✶" title="想做的事" tint="primary" />
      <MiniNavItem to="/schedule" active={isActive('/schedule')} glyph="🔔" title="提醒" tint="warning" />
      <MiniNavItem
        to="/now"
        active={isActive('/now')}
        glyph="🛎"
        title="正在做的事"
        tint="info"
        badge={pending > 0 ? pending : undefined}
      />
      <MiniNavItem to="/memory" active={isActive('/memory')} glyph="🧠" title="记得的事" tint="accent" />
      <MiniNavItem to="/help" active={isActive('/help')} glyph="📖" title="帮助" tint="success" />

      {recent.length > 0 && (
        <>
          <div className="my-1 h-px w-8 bg-base-300/60" />
          <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-1">
            {recent.map((it) => (
              <Link
                key={it.id}
                to="/intent/$intentId"
                params={{ intentId: it.id }}
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base shadow-sm transition hover:-translate-y-0.5',
                  // ring-inset keeps the active marker entirely inside the
                  // 40-px square so it never gets clipped by the narrow
                  // sidebar's right edge.
                  isIntentActive(it.id)
                    ? 'ring-[3px] ring-inset ring-primary'
                    : 'ring-1 ring-inset ring-black/10',
                )}
                style={{ background: it.cover }}
                title={it.title}
              >
                {it.emoji}
              </Link>
            ))}
          </div>
        </>
      )}

      <Link
        to="/settings"
        className="mt-auto grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-content shadow-sm"
        title="DZ · 设置"
      >
        D
      </Link>
    </aside>
  );
}

function MiniNavItem({
  to,
  active,
  glyph,
  title,
  badge,
  tint,
}: {
  to: string;
  active: boolean;
  glyph: string;
  title: string;
  badge?: number;
  tint: NavTint;
}) {
  const t = NAV_TINT[tint];
  return (
    <Link
      to={to}
      title={title}
      className={cn(
        'relative grid h-11 w-11 place-items-center rounded-2xl text-xl transition',
        active ? t.active : cn(t.idle, 'hover:scale-105'),
      )}
    >
      <span aria-hidden>{glyph}</span>
      {badge !== undefined && (
        <span className="badge badge-error badge-xs absolute -right-0.5 -top-0.5">
          {badge}
        </span>
      )}
    </Link>
  );
}
