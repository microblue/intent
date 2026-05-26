import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { useUI } from '@/state/ui';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useSession } from '@/lib/auth';
import { useClaws } from '@/data/useClaws';
import { useScheduleFiringSink } from '@/data/useScheduleFiringSink';
import { env } from '@/lib/env';
import { Sidebar } from './Sidebar';
import { BottomDock } from './BottomDock';
import { Launcher } from './Launcher';
import { ClawStatus } from './ClawStatus';
import { cn } from '@/lib/cn';

/**
 * AppShell — persistent chrome.
 *
 * Desktop: resizable horizontal PanelGroup (left Sidebar + content). The
 * sidebar can be dragged 14–28% wide, and collapsed to a narrow icon-only
 * rail (~5%) via the toggle button. We deliberately avoid full-hide because
 * the floating peek button collided with each route's own back/header
 * controls — a thin always-on rail keeps both navigations in their own
 * vertical columns.
 *
 * Mobile: no sidebar; content full-bleed; BottomDock as primary nav. The
 * chat route hides the dock so the composer owns the bottom.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = path.startsWith('/auth/');

  // Auth surfaces (sign-in / sign-up) own the entire viewport — no
  // sidebar, no dock, no Launcher. They're standalone funnels.
  if (isAuthRoute) {
    return <>{children}</>;
  }

  // Claw gate: signed-in user with zero claws was never provisioned
  // (rare — usually means they signed up on the wrong surface or their
  // myclaw.one purchase didn't fire the default-claw trigger). Bounce
  // them to the install funnel. Demo viewers + mock mode skip the gate
  // entirely so the prototype keeps working without backend writes.
  return <ClawGate>{children}</ClawGate>;
}

function ClawGate({ children }: { children: React.ReactNode }) {
  const { signedIn, loading: sessionLoading } = useSession();
  const { claws, hasResolved, isMock } = useClaws();

  // Skip the gate when:
  //   - flag is off (demo mode, claws table not consulted)
  //   - user isn't signed in (anonymous demo viewers)
  //   - session or claws are still loading (don't flash a redirect)
  if (isMock || !env.useRealData || !signedIn || sessionLoading || !hasResolved) {
    return <Chrome>{children}</Chrome>;
  }

  if (claws.length === 0) {
    // External redirect — myclaw.one owns the install/purchase flow.
    // Done via window.location, not <Link>, because the router only knows
    // aios routes.
    if (typeof window !== 'undefined') {
      window.location.replace('https://myclaw.one/aios/install');
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base-100 px-4 text-center">
        <div className="text-4xl">🛠️</div>
        <h1 className="text-lg font-semibold">正在带你去安装第一台 claw</h1>
        <p className="max-w-sm text-sm text-base-content/55">
          一下就好。如果浏览器没自动跳转,{' '}
          <a className="text-primary hover:underline" href="https://myclaw.one/aios/install">
            点这儿
          </a>
          。
        </p>
      </div>
    );
  }

  return <Chrome>{children}</Chrome>;
}

function Chrome({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isChatRoute = path.startsWith('/intent/');
  const showMobileDock = !isDesktop && !isChatRoute;

  // Drive the in-app reminder firing sink as long as the shell is
  // mounted (i.e. for any signed-in user, on any route). The hook
  // is no-op outside real-mode + signed-in.
  useScheduleFiringSink();

  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUI((s) => s.setSidebarCollapsed);
  const panelRef = useRef<ImperativePanelHandle | null>(null);

  // Sync Zustand state → Panel imperatively. We keep the Panel as the
  // source of truth for actual width (so drag-to-resize works), and use
  // Zustand only for the discrete collapsed/expanded preference.
  useEffect(() => {
    if (!isDesktop) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (sidebarCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!sidebarCollapsed && panel.isCollapsed()) panel.expand();
  }, [sidebarCollapsed, isDesktop]);

  if (!isDesktop) {
    return (
      <div className="flex min-h-screen flex-col bg-base-300/30">
        <main className={cn('flex-1', showMobileDock ? 'pb-20' : 'pb-24')}>
          {children}
        </main>
        {showMobileDock && <BottomDock />}
        <Launcher />
        {/* Mobile mounts ClawStatus off-screen so the singleton-backed
            gateway client stays subscribed (the singleton only stays
            up as long as at least one consumer is rendered). Also lets
            e2e read data-status on mobile without taking layout. */}
        <div className="sr-only" aria-hidden>
          <ClawStatus />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base-300/30">
      <PanelGroup direction="horizontal" autoSaveId="aios-shell-v2">
        {/*
          Width math (sized to fit the new bigger NavItem: 44px icon + 12px
          gap + label up to "正在做的事" 5 char @ 15px ≈ 165 px content):
            1280px viewport → 18 % = 230 px  (fits, no truncation)
            1440px        → 18 % = 259 px
            1920px        → 18 % = 346 px  (generous but balanced)
            2560px        → 18 % = 461 px  (wide; intentional — denser
                                            displays get denser chrome)
          minSize 15 % keeps 192 px at 1280, where the longest label still
          truncates cleanly rather than wrapping. collapsedSize 6 % ≈ 86 px
          @ 1440, fits the 44 px icon tiles with comfortable margin.
        */}
        <Panel
          ref={panelRef}
          id="sidebar"
          order={1}
          defaultSize={18}
          minSize={15}
          maxSize={26}
          collapsible
          collapsedSize={6}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
          // `relative z-10` puts sidebar's stacking context above content's
          // so dropdowns (account menu, ClawPicker) overlay the chat
          // composer when they extend past the sidebar's right edge in
          // collapsed mode — bug fixed 2026-05-22.
          //
          // The Panel needs overflow:visible so the sidebar's account /
          // claw-picker dropdowns can extend past the sidebar's right
          // edge into the content pane without getting clipped. Tailwind's
          // `overflow-visible` class is shadowed by react-resizable-panels'
          // inline `overflow: hidden`, so we override via `style` here.
          style={{ overflow: 'visible' }}
          className="relative z-10"
        >
          <Sidebar collapsed={sidebarCollapsed} />
        </Panel>
        <PanelResizeHandle className="group relative w-1 bg-base-300/40 transition hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary">
          <span
            aria-hidden
            className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center"
          >
            <span className="h-8 w-0.5 rounded-full bg-base-content/15 opacity-0 transition group-hover:opacity-100" />
          </span>
        </PanelResizeHandle>
        <Panel id="content" order={2} className="overflow-hidden relative z-0">
          <div className="h-full overflow-y-auto">{children}</div>
        </Panel>
      </PanelGroup>
      <Launcher />
    </div>
  );
}
