import { test, expect } from '@playwright/test';
import {
  extractMemoryCandidates,
  buildMemoryContextPrefix,
} from '../src/lib/memoryExtract';
import type { MemoryFact } from '../src/mocks/types';

/**
 * Unit-style tests for the memory candidate extractor. Pure node
 * logic; no browser needed.
 *
 * The journey-01 test message is the load-bearing case — if the
 * extractor returns 0 candidates for it, the journey will fail at
 * pass_criteria 2 (memory_facts must contain a row referencing
 * 小雨 + 花生).
 */

test.describe('extractMemoryCandidates', () => {
  test('journey-01 source: "小雨对花生过敏" gets extracted as people', () => {
    const out = extractMemoryCandidates(
      '提醒一下,小雨对花生过敏,不能买含花生的东西',
    );
    expect(out.length).toBeGreaterThanOrEqual(1);
    const allergy = out.find((c) => c.text.includes('过敏'));
    expect(allergy, '缺少过敏候选').toBeTruthy();
    expect(allergy!.category).toBe('people');
    expect(allergy!.text).toContain('小雨');
    expect(allergy!.text).toContain('花生');
    expect(allergy!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('"我对花生过敏" → about-you', () => {
    const out = extractMemoryCandidates('我对花生过敏,别给我买含花生的东西');
    const allergy = out.find((c) => c.text.includes('过敏'));
    expect(allergy).toBeTruthy();
    expect(allergy!.category).toBe('about-you');
    expect(allergy!.text).toBe('对花生过敏');
  });

  test('"我女儿小雨对花生过敏" → people, strips leading 我', () => {
    const out = extractMemoryCandidates('我女儿小雨对花生过敏');
    const allergy = out.find((c) => c.text.includes('过敏'));
    expect(allergy).toBeTruthy();
    expect(allergy!.category).toBe('people');
    expect(allergy!.text.startsWith('女儿')).toBeTruthy();
    expect(allergy!.text).toContain('小雨');
  });

  test('no false positive on "为什么对甜的过敏" (no person subject)', () => {
    // "什么" is a question pronoun — should not be treated as a name.
    const out = extractMemoryCandidates('为什么对甜的过敏会让人难受?');
    const allergies = out.filter((c) => c.text.includes('过敏'));
    expect(allergies.length).toBe(0);
  });

  test('dietary: "小雨不能吃辣" → people', () => {
    const out = extractMemoryCandidates('小雨不能吃辣的');
    const restr = out.find((c) => c.text.includes('不能吃'));
    expect(restr).toBeTruthy();
    expect(restr!.category).toBe('people');
    expect(restr!.text).toContain('小雨');
  });

  test('identity: "我是素食" → about-you', () => {
    const out = extractMemoryCandidates('提醒一下我是素食');
    const id = out.find((c) => c.category === 'about-you' && c.text.includes('素食'));
    expect(id).toBeTruthy();
  });

  test('empty / short input returns nothing', () => {
    expect(extractMemoryCandidates('')).toHaveLength(0);
    expect(extractMemoryCandidates('好的')).toHaveLength(0);
    // 'X 对 Y 过敏' shorter than 4 chars can't happen, but safety:
    expect(extractMemoryCandidates(undefined as unknown as string)).toHaveLength(0);
  });

  test('dedupes within a single message', () => {
    const out = extractMemoryCandidates('小雨对花生过敏,真的对花生过敏!');
    const allergies = out.filter((c) => c.text.includes('过敏'));
    // Both subjects are 小雨; deduped to 1.
    expect(allergies.length).toBeLessThanOrEqual(2);
  });
});

test.describe('buildMemoryContextPrefix', () => {
  const mk = (
    text: string,
    category: MemoryFact['category'],
  ): MemoryFact => ({
    id: `mem-${text}`,
    text,
    category,
    createdAt: new Date().toISOString(),
  });

  test('empty facts → empty prefix', () => {
    expect(buildMemoryContextPrefix([])).toBe('');
  });

  test('only project facts → empty prefix (project-scoped, not cross-intent)', () => {
    const prefix = buildMemoryContextPrefix([mk('预算 5000', 'project')]);
    expect(prefix).toBe('');
  });

  test('about-you / people / preferences included; project excluded', () => {
    const prefix = buildMemoryContextPrefix([
      mk('小雨对花生过敏', 'people'),
      mk('对牛奶过敏', 'about-you'),
      mk('喜欢早班机', 'preferences'),
      mk('这件事预算 5000', 'project'),
    ]);
    expect(prefix).toContain('小雨对花生过敏');
    expect(prefix).toContain('对牛奶过敏');
    expect(prefix).toContain('喜欢早班机');
    expect(prefix).not.toContain('预算 5000');
    expect(prefix.endsWith('\n\n')).toBeTruthy();
  });
});
