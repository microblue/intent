/**
 * Coerce arbitrary thrown values into a lay-user-friendly toast string.
 *
 * Replaces the pattern
 *   `toast(err instanceof Error ? err.message : '友好兜底')`
 * across all data-mutation sites — that pattern leaked raw library
 * messages like "Failed to fetch", "NetworkError when attempting to
 * fetch resource", "AuthApiError: rate limit exceeded" directly into
 * user-facing toasts. Per CLAUDE.md ("Errors are friendly natural-
 * language suggestions, not status codes") that's wrong.
 *
 * Decision tree:
 *   1. Not an Error → fallback.
 *   2. Network-shaped message → canonical "网络好像不太通,稍后再试".
 *   3. Rate-limit-shaped → canonical "请求太频繁了,稍等一下再来".
 *   4. Auth-shaped → canonical "登录状态不对,刷新一下页面试试".
 *   5. Message contains any CJK ideograph → likely one of our own
 *      friendly throws (mintClawToken etc.), pass through.
 *   6. Otherwise → fallback (don't leak lib English).
 */
export function friendlyError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  if (!msg) return fallback;

  if (/failed to fetch|networkerror|load failed|fetch.*failed/i.test(msg)) {
    return '网络好像不太通,稍后再试';
  }
  if (/rate limit|too many requests|429/i.test(msg)) {
    return '请求太频繁了,稍等一下再来';
  }
  if (/unauthorized|401|jwt|invalid.*session/i.test(msg)) {
    return '登录状态不对,刷新一下页面试试';
  }

  // Our own throws are in Chinese (mint.ts, friendly auth errors, etc.).
  // Anything else (library internals, English) → use the friendly
  // fallback the caller supplied.
  if (/[一-龥]/.test(msg)) return msg;
  return fallback;
}
