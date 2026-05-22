import { test, expect } from '@playwright/test';
import { parseReminder } from '../src/lib/parseReminder';

/**
 * Unit-style tests for the Chinese reminder NL parser. Pure node logic;
 * no browser needed — Playwright runs these under its node runtime.
 *
 * Pin `now` for deterministic timestamps. Picked a Wednesday afternoon so
 * "周三 10 点" + "周一 9 点" + "明天" + "5 月 19 日 中午 12 点" all produce
 * meaningfully different future dates without crossing year boundaries.
 */

// 2026-05-13 (Wednesday) 14:30 local time
const NOW = new Date(2026, 4, 13, 14, 30, 0, 0);

test.describe('parseReminder', () => {
  test('每天 X 点 → daily recurrence', () => {
    const r = parseReminder('每天 9 点 吃药', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('吃药');
    expect(r!.recurrence?.kind).toBe('daily');
    expect(r!.recurrence?.label).toBe('每天 9:00');
    // 14:30 today → first fire tomorrow 09:00
    expect(new Date(r!.fireAt).getDate()).toBe(14);
    expect(new Date(r!.fireAt).getHours()).toBe(9);
  });

  test('每周一 早上 9 点 → weekly Monday', () => {
    const r = parseReminder('每周一 早上 9 点 周会', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('周会');
    expect(r!.recurrence?.kind).toBe('weekly');
    expect(r!.recurrence?.label).toBe('每周一 9:00');
    // Wed 14:30 → next Monday is May 18
    expect(new Date(r!.fireAt).getDate()).toBe(18);
    expect(new Date(r!.fireAt).getHours()).toBe(9);
  });

  test('每周三 下午 2 点 → weekly Wednesday afternoon', () => {
    const r = parseReminder('每周三 下午 2 点 复盘', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('复盘');
    expect(r!.recurrence?.kind).toBe('weekly');
    // Today is Wed 14:30, fire at 14:00 already passed → next Wed May 20
    expect(new Date(r!.fireAt).getDate()).toBe(20);
    expect(new Date(r!.fireAt).getHours()).toBe(14);
  });

  test('5 月 19 日 中午 12 点 → absolute date', () => {
    const r = parseReminder('5 月 19 日 中午 12 点 妈妈生日', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('妈妈生日');
    expect(r!.recurrence).toBeUndefined();
    expect(new Date(r!.fireAt).getMonth()).toBe(4); // May
    expect(new Date(r!.fireAt).getDate()).toBe(19);
    expect(new Date(r!.fireAt).getHours()).toBe(12);
  });

  test('明天 早上 8 点 → tomorrow morning', () => {
    const r = parseReminder('明天 早上 8 点 跑步', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('跑步');
    expect(new Date(r!.fireAt).getDate()).toBe(14);
    expect(new Date(r!.fireAt).getHours()).toBe(8);
  });

  test('明早 8 点 → implicit AM', () => {
    const r = parseReminder('明早 8 点 跑步', NOW);
    expect(r).not.toBeNull();
    expect(new Date(r!.fireAt).getHours()).toBe(8);
  });

  test('今天 下午 3 点 → today afternoon', () => {
    const r = parseReminder('今天 下午 3 点 取快递', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('取快递');
    expect(new Date(r!.fireAt).getDate()).toBe(13);
    expect(new Date(r!.fireAt).getHours()).toBe(15);
  });

  test('下周一 9 点 → next Monday', () => {
    const r = parseReminder('下周一 9 点 团建', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('团建');
    // Wed May 13 → next Monday is May 25 (not May 18)
    expect(new Date(r!.fireAt).getDate()).toBe(25);
  });

  test('周六 10 点 → upcoming Saturday', () => {
    const r = parseReminder('周六 10 点 看牙医', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('看牙医');
    // Wed May 13 → upcoming Saturday is May 16
    expect(new Date(r!.fireAt).getDate()).toBe(16);
    expect(new Date(r!.fireAt).getHours()).toBe(10);
  });

  test('上午 11:30 见客户 → HH:MM format', () => {
    const r = parseReminder('上午 11:30 见客户', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('见客户');
    expect(new Date(r!.fireAt).getHours()).toBe(11);
    expect(new Date(r!.fireAt).getMinutes()).toBe(30);
  });

  test('bare 9 点 → today/tomorrow 9 AM', () => {
    const r = parseReminder('9 点 吃药', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('吃药');
    // 09:00 already passed today → tomorrow
    expect(new Date(r!.fireAt).getDate()).toBe(14);
    expect(new Date(r!.fireAt).getHours()).toBe(9);
  });

  test('Chinese numerals: 五月十九号 → 2026-05-19', () => {
    const r = parseReminder('五月十九号 中午 12 点 妈妈生日', NOW);
    expect(r).not.toBeNull();
    expect(new Date(r!.fireAt).getMonth()).toBe(4);
    expect(new Date(r!.fireAt).getDate()).toBe(19);
  });

  test('garbage in → null out', () => {
    expect(parseReminder('hello world', NOW)).toBeNull();
    expect(parseReminder('', NOW)).toBeNull();
    expect(parseReminder('提醒我做点事', NOW)).toBeNull();
  });

  test('strips polite prefixes from title', () => {
    const r = parseReminder('每天 9 点 提醒我 吃药', NOW);
    expect(r).not.toBeNull();
    expect(r!.title).toBe('吃药');
  });

  test('9点半 → 9:30', () => {
    const r = parseReminder('明天 9 点半 跑步', NOW);
    expect(r).not.toBeNull();
    expect(new Date(r!.fireAt).getHours()).toBe(9);
    expect(new Date(r!.fireAt).getMinutes()).toBe(30);
  });
});
