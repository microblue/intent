import type { ScheduleEvent } from '@/mocks/types';

/**
 * Client-side NL → reminder parser for the lay-user "提醒" composer.
 *
 * Goal: cover ≥80% of typical Chinese reminder inputs without round-
 * tripping to an LLM. The shape of inputs that matter:
 *
 *   "每天 9 点 吃药"                  → daily 09:00
 *   "每周一 早上 9 点 周会"           → weekly Monday 09:00
 *   "每周三 下午 2 点 复盘"           → weekly Wednesday 14:00
 *   "5 月 19 日 中午 12 点 妈妈生日"  → one-shot 2026-05-19 12:00
 *   "明天 早上 8 点 跑步"             → one-shot tomorrow 08:00
 *   "今天 下午 3 点 取快递"           → one-shot today 15:00
 *   "下周一 9 点 团建"                → one-shot next-Monday 09:00
 *   "周六 10 点 看牙医"               → one-shot upcoming Saturday 10:00
 *   "9 点 吃药"                       → today/tomorrow 09:00 (whichever future)
 *   "上午 11:30 见客户"               → today/tomorrow 11:30
 *
 * Anything we can't confidently parse returns `null`; the caller surfaces
 * a friendly "我没听明白时间,试试 '明天早上 9 点 吃药' 这样的写法"
 * instead of guessing.
 *
 * Timezone: this runs in the browser, so `new Date(...)` uses the user's
 * local timezone. That matches what a non-technical user expects ("8
 * 点" = 8am wall-clock, not UTC). We do NOT touch UTC math here.
 */

export interface ParsedReminder {
  title: string;
  /** ISO 8601 timestamp (local-time wall clock encoded). */
  fireAt: string;
  recurrence?: ScheduleEvent['recurrence'];
}

const WEEKDAYS: Record<string, number> = {
  // Sunday=0, Monday=1, ...
  '周日': 0, '周天': 0, '星期日': 0, '星期天': 0, '礼拜日': 0, '礼拜天': 0,
  '周一': 1, '星期一': 1, '礼拜一': 1,
  '周二': 2, '星期二': 2, '礼拜二': 2,
  '周三': 3, '星期三': 3, '礼拜三': 3,
  '周四': 4, '星期四': 4, '礼拜四': 4,
  '周五': 5, '星期五': 5, '礼拜五': 5,
  '周六': 6, '星期六': 6, '礼拜六': 6,
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const CHINESE_DIGITS: Record<string, number> = {
  '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

/**
 * Normalize Chinese numerals up to 31 into Arabic. Handles "十", "二十",
 * "二十三" etc. Returns NaN for anything we can't read.
 */
function parseChineseInt(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const chars = s.split('');
  if (chars.length === 1) return CHINESE_DIGITS[chars[0]] ?? NaN;
  if (chars.length === 2) {
    // "十X" → 10+X, "X十" → X*10
    if (chars[0] === '十') return 10 + (CHINESE_DIGITS[chars[1]] ?? NaN);
    if (chars[1] === '十') return (CHINESE_DIGITS[chars[0]] ?? NaN) * 10;
  }
  if (chars.length === 3 && chars[1] === '十') {
    return (CHINESE_DIGITS[chars[0]] ?? NaN) * 10 + (CHINESE_DIGITS[chars[2]] ?? NaN);
  }
  return NaN;
}

/** Extract `{ hour, minute }` from `9 点`, `9:30`, `09 点 30 分`, `下午 2 点`, etc. */
function extractTime(input: string): { hour: number; minute: number; rest: string } | null {
  // Look for HH:MM first — most precise.
  const colon = input.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (colon) {
    let hour = parseInt(colon[1], 10);
    const minute = parseInt(colon[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    // Apply AM/PM hint nearby
    const before = input.slice(0, colon.index ?? 0);
    if (/(下午|晚上|傍晚)/.test(before) && hour < 12) hour += 12;
    if (/(上午|早上|早晨|清晨)/.test(before) && hour === 12) hour = 0;
    const rest = (input.slice(0, colon.index!) + input.slice((colon.index ?? 0) + colon[0].length))
      .replace(/(下午|晚上|傍晚|上午|早上|早晨|清晨|中午|凌晨)/g, '')
      .trim();
    return { hour, minute, rest };
  }
  // "9 点 (30 分)" / "9点半" / "上午 11 点"
  const dot = input.match(/(下午|晚上|傍晚|上午|早上|早晨|清晨|中午|凌晨)?\s*([一二三四五六七八九十0-9]{1,3})\s*点\s*(半|[一二三四五六七八九十0-9]{1,3})?\s*(分)?/);
  if (!dot) return null;
  const ampm = dot[1] ?? '';
  let hour = parseChineseInt(dot[2]);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  let minute = 0;
  if (dot[3] === '半') minute = 30;
  else if (dot[3]) {
    const m = parseChineseInt(dot[3]);
    if (!Number.isNaN(m) && m >= 0 && m < 60) minute = m;
  }
  if ((ampm === '下午' || ampm === '晚上' || ampm === '傍晚') && hour < 12) hour += 12;
  if (ampm === '中午' && hour < 6) hour = 12; // "中午 12" stays 12; "中午" alone → noon
  if (ampm === '凌晨' && hour >= 12) hour -= 12;
  if ((ampm === '上午' || ampm === '早上' || ampm === '早晨' || ampm === '清晨') && hour === 12) hour = 0;
  const rest = (input.slice(0, dot.index!) + input.slice((dot.index ?? 0) + dot[0].length)).trim();
  return { hour, minute, rest };
}

/** Set a date to a given local hour:minute, returning a new Date. */
function atHourMinute(date: Date, hour: number, minute: number): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Strip leading time/recurrence/anchor tokens from `rest`. Whatever
 * remains is the user-facing reminder title. We also trim trailing
 * separators ("提醒我", "再") that are filler, not content.
 */
function cleanTitle(rest: string): string {
  return rest
    .replace(/^(请|帮我|提醒我|记得|要)/g, '')
    .replace(/(提醒我|提醒|记得)$/g, '')
    .replace(/[,，、。]+$/g, '')
    .trim();
}

export function parseReminder(input: string, now: Date = new Date()): ParsedReminder | null {
  const raw = input.trim();
  if (!raw) return null;

  // ───── Pattern 1: 每天 [时间] [标题] ─────────────────────────────
  if (/^每天/.test(raw) || /^每日/.test(raw)) {
    const without = raw.replace(/^每天|^每日/, '').trim();
    const time = extractTime(without);
    if (!time) return null;
    const title = cleanTitle(time.rest);
    if (!title) return null;
    const fireAt = atHourMinute(now, time.hour, time.minute);
    // If today's slot already passed, the first fire is tomorrow.
    if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 1);
    return {
      title,
      fireAt: fireAt.toISOString(),
      recurrence: {
        kind: 'daily',
        spec: `${time.hour}:${String(time.minute).padStart(2, '0')}`,
        label: `每天 ${time.hour}:${String(time.minute).padStart(2, '0')}`,
      },
    };
  }

  // ───── Pattern 2: 每周X [时间] [标题] ────────────────────────────
  const weekly = raw.match(/^每(周|星期|礼拜)(日|天|一|二|三|四|五|六)/);
  if (weekly) {
    const weekdayChar = weekly[2];
    const weekdayKey = `周${weekdayChar === '天' ? '日' : weekdayChar}`;
    const targetDow = WEEKDAYS[weekdayKey];
    if (targetDow === undefined) return null;
    const without = raw.slice(weekly[0].length).trim();
    const time = extractTime(without);
    if (!time) return null;
    const title = cleanTitle(time.rest);
    if (!title) return null;
    const fireAt = atHourMinute(now, time.hour, time.minute);
    const delta = (targetDow - fireAt.getDay() + 7) % 7;
    fireAt.setDate(fireAt.getDate() + delta);
    if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 7);
    const label = `每${WEEKDAY_LABELS[targetDow]} ${time.hour}:${String(time.minute).padStart(2, '0')}`;
    return {
      title,
      fireAt: fireAt.toISOString(),
      recurrence: {
        kind: 'weekly',
        spec: `${targetDow}:${time.hour}:${String(time.minute).padStart(2, '0')}`,
        label,
      },
    };
  }

  // ───── Pattern 3: X 月 X 日 [时间] [标题] ────────────────────────
  const ymd = raw.match(/^(\d{1,2}|[一二三四五六七八九十]{1,3})\s*月\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[日号]/);
  if (ymd) {
    const month = parseChineseInt(ymd[1]);
    const day = parseChineseInt(ymd[2]);
    if (Number.isNaN(month) || Number.isNaN(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const without = raw.slice(ymd[0].length).trim();
    const time = extractTime(without);
    if (!time) return null;
    const title = cleanTitle(time.rest);
    if (!title) return null;
    const candidate = new Date(now.getFullYear(), month - 1, day, time.hour, time.minute, 0, 0);
    // If the date already passed this year, roll to next year.
    if (candidate.getTime() <= now.getTime()) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
    return { title, fireAt: candidate.toISOString() };
  }

  // ───── Pattern 4: 明天 / 后天 / 今天 [时间] [标题] ───────────────
  const relDay = raw.match(/^(今天|今晚|今早|今夜|明天|明晚|明早|后天|大后天)/);
  if (relDay) {
    const offsetMap: Record<string, number> = {
      '今天': 0, '今晚': 0, '今早': 0, '今夜': 0,
      '明天': 1, '明晚': 1, '明早': 1,
      '后天': 2,
      '大后天': 3,
    };
    const offset = offsetMap[relDay[1]];
    let without = raw.slice(relDay[0].length).trim();
    // Apply implicit AM/PM hint from the prefix
    if (/晚|夜/.test(relDay[1]) && !/(下午|晚上|傍晚)/.test(without)) without = '晚上 ' + without;
    if (/早/.test(relDay[1]) && !/(上午|早上|早晨|清晨)/.test(without)) without = '早上 ' + without;
    const time = extractTime(without);
    if (!time) return null;
    const title = cleanTitle(time.rest);
    if (!title) return null;
    const fireAt = new Date(now);
    fireAt.setDate(fireAt.getDate() + offset);
    fireAt.setHours(time.hour, time.minute, 0, 0);
    return { title, fireAt: fireAt.toISOString() };
  }

  // ───── Pattern 5: 下周X / 这周X / 周X [时间] [标题] ──────────────
  const dowMatch = raw.match(/^(下个?|下|这个?|这)?\s*(周|星期|礼拜)(日|天|一|二|三|四|五|六)/);
  if (dowMatch) {
    const isNext = /下/.test(dowMatch[1] ?? '');
    const weekdayChar = dowMatch[3];
    const weekdayKey = `周${weekdayChar === '天' ? '日' : weekdayChar}`;
    const targetDow = WEEKDAYS[weekdayKey];
    if (targetDow === undefined) return null;
    const without = raw.slice(dowMatch[0].length).trim();
    const time = extractTime(without);
    if (!time) return null;
    const title = cleanTitle(time.rest);
    if (!title) return null;
    const fireAt = atHourMinute(now, time.hour, time.minute);
    let delta = (targetDow - fireAt.getDay() + 7) % 7;
    if (delta === 0 && fireAt.getTime() <= now.getTime()) delta = 7;
    if (isNext && delta < 7) delta += 7;
    fireAt.setDate(fireAt.getDate() + delta);
    return { title, fireAt: fireAt.toISOString() };
  }

  // ───── Pattern 6: bare time → today (or tomorrow if past) ────────
  const bare = extractTime(raw);
  if (bare) {
    const title = cleanTitle(bare.rest);
    if (!title) return null;
    const fireAt = atHourMinute(now, bare.hour, bare.minute);
    if (fireAt.getTime() <= now.getTime()) fireAt.setDate(fireAt.getDate() + 1);
    return { title, fireAt: fireAt.toISOString() };
  }

  return null;
}
