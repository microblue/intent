import { useGateway } from '@/gateway/useGateway';
import { cn } from '@/lib/cn';

/**
 * ClawStatus — tiny indicator showing whether the SPA has a live WS
 * connection to its default claw. Shown in the desktop sidebar footer
 * area; mobile gets the same surface in /settings (TBD).
 *
 * Mock-mode users see no indicator (the gateway isn't relevant when
 * data is mocked). Signed-out users see no indicator. Sentinel-only
 * users see the indicator but it stays "未连" because we never try.
 */
export function ClawStatus({ compact = false }: { compact?: boolean }) {
  const { status, isMock, clawId, reason } = useGateway();
  if (isMock) return null;
  if (!clawId) return null;

  const tone =
    status === 'connected'
      ? 'bg-success'
      : status === 'connecting' || status === 'reconnecting'
        ? 'bg-warning animate-pulse'
        : 'bg-base-300';
  const label =
    status === 'connected'
      ? '已连上 claw'
      : status === 'connecting'
        ? '正在连…'
        : status === 'reconnecting'
          ? '重新连…'
          : status === 'error'
            ? '连不上'
            : '未连';

  return (
    <div
      data-testid="claw-status"
      data-status={status}
      title={reason ?? undefined}
      className={cn(
        'flex items-center gap-1.5 text-xs text-base-content/55',
        compact && 'flex-col gap-0.5',
      )}
    >
      <span aria-hidden className={cn('inline-block h-2 w-2 rounded-full', tone)} />
      <span>{label}</span>
    </div>
  );
}
