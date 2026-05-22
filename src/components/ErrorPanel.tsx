import { friendlyError } from '@/lib/friendlyError';
import { cn } from '@/lib/cn';

/**
 * ErrorPanel — friendly retry surface for failed data fetches.
 *
 * Lay-user contract: never show a raw error code; explain in one
 * sentence what happened, and give one prominent way out (retry).
 * The retry button defaults to `window.location.reload()` because
 * that's the simplest action a non-technical user already
 * understands ("refresh"); pass `onRetry` to use a TanStack-Query
 * `refetch()` instead when one is available.
 */

interface Props {
  /** Title shown above the friendly error message. */
  title: string;
  /** The thrown error — pipes through friendlyError(). */
  error: unknown;
  /** Fallback copy when friendlyError can't make sense of the error. */
  fallback?: string;
  /** Optional explicit retry handler. Defaults to a full page reload. */
  onRetry?: () => void;
  /** Test hook. */
  testId?: string;
  className?: string;
}

export function ErrorPanel({
  title,
  error,
  fallback = '稍等一下,再刷新一次试试。',
  onRetry,
  testId,
  className,
}: Props) {
  const message = friendlyError(error, fallback);
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div
      data-testid={testId ?? 'error-panel'}
      className={cn(
        'rounded-2xl border border-error/30 bg-error/5 p-6 text-sm text-error',
        className,
      )}
    >
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-error/80">{message}</p>
      <button
        type="button"
        onClick={handleRetry}
        data-testid="error-panel-retry"
        aria-label="再试一次"
        className="btn btn-error btn-sm mt-3 gap-1.5 rounded-full"
      >
        <span aria-hidden>↻</span>
        再试一次
      </button>
    </div>
  );
}
