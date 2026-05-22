import { useEffect, useRef, useState } from 'react';
import { useGateway } from '@/gateway/useGateway';
import { isSentinelClaw, useClaws } from '@/data/useClaws';
import { useUI } from '@/state/ui';
import { cn } from '@/lib/cn';
import { friendlyError } from '@/lib/friendlyError';

/**
 * ClawPicker — visible claw selector + live connection status.
 *
 * Two shapes:
 *   - Single real claw → quiet non-interactive pill (claw name + status
 *     dot). Same shape as the original component.
 *   - 2+ real claws → dropdown trigger; opening the menu lists every
 *     real claw with the active one highlighted. Clicking a claw row
 *     writes selectedClawId into the UI store; useGateway recycles to
 *     the new claw on the next render, and the dot animates through
 *     connecting → connected.
 *
 * Hidden in mock mode (no gateway to talk about) and when the user
 * has no real claw — that state is owned by IntentList's sentinel
 * banner.
 */
export function ClawPicker() {
  const { status, isMock, reason } = useGateway();
  const { realClaws, activeClaw, claws } = useClaws();
  const setSelectedClawId = useUI((s) => s.setSelectedClawId);
  const selectedClawId = useUI((s) => s.selectedClawId);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close the popover on any outside click.
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (isMock) return null;
  if (!activeClaw || realClaws.length === 0) return null;

  // If selectedClawId points at a missing / sentinel claw row, clear it
  // so the persisted value doesn't outlive the claws it once referred
  // to. Cheap effect — runs at most once per claws-query change.
  if (
    selectedClawId !== null &&
    !realClaws.some((c) => c.id === selectedClawId) &&
    claws.some((c) => c.id === selectedClawId && isSentinelClaw(c)) === false
  ) {
    // Defer to avoid setState-during-render; useEffect is overkill for
    // a one-line cleanup that runs after render.
    queueMicrotask(() => {
      // Re-check inside the microtask in case another consumer fixed it.
      const stillStale = !realClaws.some((c) => c.id === selectedClawId);
      if (stillStale) setSelectedClawId(null);
    });
  }

  const tone =
    status === 'connected'
      ? 'bg-success'
      : status === 'connecting' || status === 'reconnecting'
        ? 'bg-warning animate-pulse'
        : 'bg-base-300';
  const statusLabel =
    status === 'connected'
      ? '已连上'
      : status === 'connecting'
        ? '正在连…'
        : status === 'reconnecting'
          ? '重新连…'
          : status === 'error'
            ? '连不上'
            : '未连';

  const tip = reason
    ? friendlyError(new Error(reason), '稍等一下再试')
    : undefined;

  const isMulti = realClaws.length > 1;

  // Single-claw shape — exactly the original pill (kept stable so
  // existing F-walkthrough screenshots don't shift unnecessarily).
  if (!isMulti) {
    return (
      <div
        data-testid="claw-picker"
        data-status={status}
        title={tip}
        className={cn(
          'flex items-center gap-2 rounded-full bg-base-200/60 px-3 py-1 text-xs',
          'ring-1 ring-base-300/40',
        )}
      >
        <span
          aria-hidden
          className={cn('inline-block h-2 w-2 shrink-0 rounded-full', tone)}
        />
        <span className="truncate font-medium text-base-content/85">
          {activeClaw.name}
        </span>
        <span className="text-base-content/45">·</span>
        <span className="shrink-0 text-base-content/55">{statusLabel}</span>
      </div>
    );
  }

  // Multi-claw shape — a dropdown trigger. We mount our own popover
  // (not DaisyUI's dropdown) so the parent sidebar account-menu
  // dropdown doesn't fight us for the click.
  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={(e) => {
          // The sidebar account row is a button — stop the click from
          // toggling the account dropdown when the user is aiming at
          // the picker chip nested inside it.
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        data-testid="claw-picker"
        data-status={status}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`选择 claw,当前 ${activeClaw.name}`}
        title={tip}
        className={cn(
          'flex w-full items-center gap-2 rounded-full bg-base-200/60 px-3 py-1 text-left text-xs',
          'ring-1 ring-base-300/40 hover:bg-base-200',
        )}
      >
        <span
          aria-hidden
          className={cn('inline-block h-2 w-2 shrink-0 rounded-full', tone)}
        />
        <span className="truncate font-medium text-base-content/85">
          {activeClaw.name}
        </span>
        <span className="text-base-content/45">·</span>
        <span className="shrink-0 text-base-content/55">{statusLabel}</span>
        <span aria-hidden className="ml-auto text-base-content/45">
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="claw 列表"
          data-testid="claw-picker-menu"
          className={cn(
            'absolute bottom-full left-0 z-50 mb-1 w-56 overflow-hidden rounded-2xl',
            'bg-base-100 p-1.5 text-sm shadow-xl ring-1 ring-base-300/40',
          )}
        >
          {realClaws.map((c) => {
            const isActive = c.id === activeClaw.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-testid={`claw-picker-option-${c.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setSelectedClawId(c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'hover:bg-base-200',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'inline-block h-2 w-2 shrink-0 rounded-full',
                      isActive ? tone : 'bg-base-300',
                    )}
                  />
                  <span className="truncate font-medium">{c.name}</span>
                  {isActive && (
                    <span
                      aria-hidden
                      className="ml-auto text-xs text-primary"
                    >
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
