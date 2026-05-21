/**
 * Sliding-window rate limiter — small, allocation-light, no deps.
 *
 * Used on the chat send path so a runaway loop / repeated-click /
 * keyboard-stuck user can't spam the gateway and burn LLM tokens. The
 * gateway has its own server-side limits; this is the polite-UX layer
 * that shows a friendly nudge before we ever hit them.
 *
 * Numbers chosen empirically: 5 sends per 10s lets a thoughtful
 * multi-turn dialog ("yes", "no", "go on") through unimpeded but
 * blocks a tight `for (i=0;i<20;i++)` cleanly after ~5 sends.
 */

export interface SendRateLimiter {
  /** Returns true if the send is allowed and records the timestamp. */
  tryAcquire(now?: number): boolean;
  /** ms until next slot opens; 0 when not currently limited. */
  nextSlotMs(now?: number): number;
}

export const SEND_WINDOW_MS = 10_000;
export const SEND_MAX_PER_WINDOW = 5;

export function createSendRateLimiter(
  windowMs = SEND_WINDOW_MS,
  maxPerWindow = SEND_MAX_PER_WINDOW,
): SendRateLimiter {
  const stamps: number[] = [];

  const prune = (now: number) => {
    const cutoff = now - windowMs;
    while (stamps.length && stamps[0] < cutoff) stamps.shift();
  };

  return {
    tryAcquire(now = Date.now()) {
      prune(now);
      if (stamps.length >= maxPerWindow) return false;
      stamps.push(now);
      return true;
    },
    nextSlotMs(now = Date.now()) {
      prune(now);
      if (stamps.length < maxPerWindow) return 0;
      return Math.max(0, windowMs - (now - stamps[0]));
    },
  };
}
