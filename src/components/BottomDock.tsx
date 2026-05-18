import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { pendingApprovalCount } from '@/mocks';
import { cn } from '@/lib/cn';

/**
 * Mobile bottom navigation — the phone paradigm.
 *
 * Five slots, iOS / Android tab-bar pattern:
 *   首页 · 提醒 · ✨新建(center, raised) · 通知 · 我的
 *
 * Built on DaisyUI's `dock` component; the center "+" is raised slightly
 * to match the FAB-in-tab-bar pattern from native apps. Every slot is a
 * real route (no overlays) so back-button navigation is consistent.
 */
export function BottomDock() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pending = pendingApprovalCount();
  const navigate = useNavigate();

  const isActive = (p: string) => path === p;

  return (
    <nav className="dock dock-md border-t border-base-300/60 bg-base-100/95 backdrop-blur md:hidden">
      <DockItem active={isActive('/')} onClick={() => navigate({ to: '/' })} icon="✶" label="想做的事" />
      <DockItem
        active={isActive('/schedule')}
        onClick={() => navigate({ to: '/schedule' })}
        icon="🔔"
        label="提醒"
      />
      <button
        type="button"
        onClick={() => navigate({ to: '/new', search: { seed: undefined } })}
        className="-mt-5 grid place-items-center"
        aria-label="新想做的事"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-2xl text-primary-content shadow-lg ring-4 ring-base-100">
          ✨
        </span>
      </button>
      <DockItem
        active={isActive('/now')}
        onClick={() => navigate({ to: '/now' })}
        icon="🛎"
        label="通知"
        badge={pending > 0 ? pending : undefined}
      />
      <Link
        to="/settings"
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 text-[0.8125rem]',
          isActive('/settings') ? 'text-primary' : 'text-base-content/60',
        )}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary/80 to-accent/80 text-xs font-semibold text-primary-content">
          D
        </span>
        <span>我的</span>
      </Link>
    </nav>
  );
}

function DockItem({
  active = false,
  onClick,
  icon,
  label,
  badge,
}: {
  active?: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 text-[0.8125rem]',
        active ? 'text-primary' : 'text-base-content/60',
      )}
    >
      <span aria-hidden className="text-lg">
        {icon}
      </span>
      <span>{label}</span>
      {badge !== undefined && (
        <span className="absolute right-2 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[0.75rem] font-bold text-error-content ring-2 ring-base-100">
          {badge}
        </span>
      )}
    </button>
  );
}
