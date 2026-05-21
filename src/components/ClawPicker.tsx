import { useGateway } from '@/gateway/useGateway';
import { useClaws } from '@/data/useClaws';
import { cn } from '@/lib/cn';
import { friendlyError } from '@/lib/friendlyError';

/**
 * ClawPicker — visible claw selector + live connection status.
 *
 * Phase 6 plan deliverable: "claw picker 显示 cool-brook, 点开 WS
 * 连接,'connected' 标示亮." Today every user has at most one real
 * claw, so the picker collapses to a label row. When multi-claw lands
 * (Phase 7+), the same component switches to a dropdown.
 *
 * Hidden in mock-mode (the gateway isn't relevant when data is
 * mocked) and when the user has no real claw (sentinel-only state is
 * driven by IntentList's separate banner).
 */
export function ClawPicker() {
  const { status, isMock, reason } = useGateway();
  const { realClaws, defaultClaw } = useClaws();

  if (isMock) return null;
  if (!defaultClaw || realClaws.length === 0) return null;

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

  // Single-claw shape — a quiet pill showing the claw name + status.
  // Multi-claw (TBD) wraps this same content in a dropdown trigger.
  return (
    <div
      data-testid="claw-picker"
      data-status={status}
      title={reason ? friendlyError(new Error(reason), '稍等一下再试') : undefined}
      className={cn(
        'flex items-center gap-2 rounded-full bg-base-200/60 px-3 py-1 text-xs',
        'ring-1 ring-base-300/40',
      )}
    >
      <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', tone)} />
      <span className="truncate font-medium text-base-content/85">{defaultClaw.name}</span>
      <span className="text-base-content/45">·</span>
      <span className="shrink-0 text-base-content/55">{statusLabel}</span>
    </div>
  );
}
