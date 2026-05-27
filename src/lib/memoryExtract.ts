/**
 * memoryExtract — pluck high-confidence memory candidates out of a
 * user chat message.
 *
 * Story: the /memory UI promises "我会顺手把重要的事写下来"
 * (lay-user copy for "I'll auto-record important things"), but until
 * L1 nothing actually ran. This module is the smallest viable
 * implementation: pattern-match a few unambiguous Chinese constructs
 * (allergies, food preferences, family relations, role/job, dietary
 * profile) and surface them as `MemoryCandidate`s ranked by confidence.
 *
 * The chat thread auto-saves candidates with `confidence >= 0.9` after
 * each user message. Lower-confidence matches reserve the "confirm
 * card" UI affordance for a later phase (still wired through the same
 * shape so callers don't need to change).
 *
 * Hard constraints:
 * - Pure function. No I/O, no env, no React.
 * - No mutation of the input.
 * - Conservative bias: false positives waste a memory_facts row +
 *   make the user think "but I didn't tell you that?"; false
 *   negatives are recoverable (user can add manually on /memory).
 *   When in doubt, skip.
 */

import type { MemoryFact } from '@/mocks/types';

export interface MemoryCandidate {
  /** The natural-language fact that should land in memory_facts.text. */
  text: string;
  /** Which bucket on /memory this goes into. */
  category: MemoryFact['category'];
  /** 0..1. Auto-save threshold is 0.9. */
  confidence: number;
  /** The matched fragment of the source message — used for debugging. */
  source: string;
}

const RELATION_WORDS = [
  '女儿',
  '儿子',
  '老婆',
  '老公',
  '妻子',
  '丈夫',
  '妈妈',
  '爸爸',
  '父亲',
  '母亲',
  '妹妹',
  '妹',
  '姐姐',
  '姐',
  '弟弟',
  '弟',
  '哥哥',
  '哥',
  '孩子',
  '宝宝',
  '宝贝',
  '闺女',
  '小孩',
];

const RELATION_RE = new RegExp(`我?(${RELATION_WORDS.join('|')})`);

/**
 * Heuristic for "is this short Chinese fragment plausibly a personal
 * name?" Names in modern Mandarin are 2–4 hanzi and don't lead with
 * common pronouns / particles. We bias toward people for any 2–4 hanzi
 * subject that isn't an obvious pronoun. False positives here cost a
 * memory_facts row; the user can dismiss it.
 */
function looksLikeName(s: string): boolean {
  if (s.length < 2 || s.length > 4) return false;
  if (/^(我|你|他|她|它|我们|你们|他们|这|那|谁|什么)/.test(s)) return false;
  // Reject question fragments anywhere in the subject —
  // "为什么对甜的过敏" greedy-matches "为什么" as a subject.
  if (/什么|啥|怎么|怎样|为何|为啥|哪里|哪个|是不是|能不能|应不应/.test(s)) {
    return false;
  }
  // Pure hanzi only — block punctuation / latin / numerics.
  if (!/^[一-鿿]+$/.test(s)) return false;
  return true;
}

/**
 * Detect `<subject>对<substance>过敏` mentions.
 *
 * Strongest signal in the extractor — allergies are medical and
 * permanent enough that auto-saving without confirmation respects
 * the user's intent. Three sub-cases:
 *
 *   "我对花生过敏"        → about-you, text "对花生过敏"
 *   "小雨对花生过敏"      → people,    text "小雨对花生过敏"
 *   "我女儿小雨对花生过敏" → people,    text "我女儿小雨对花生过敏"
 *
 * Substance is whatever runs up to 8 Chinese chars between `对` and
 * `过敏`; that catches "牛奶", "海鲜", "猫毛", "青霉素" without
 * accidentally grabbing whole sentences.
 */
function findAllergies(text: string): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();

  // Greedy subject match — captures "我女儿小雨" as one phrase, not
  // just "我" / "女儿" individually. The subject can be:
  //   - 我
  //   - 我?(relation word) optionally followed by a name
  //   - a bare name
  const re =
    /(我|我?(?:女儿|儿子|老婆|老公|妻子|丈夫|妈妈|爸爸|父亲|母亲|妹妹|妹|姐姐|姐|弟弟|弟|哥哥|哥|孩子|宝宝|宝贝|闺女|小孩)[一-鿿]{0,4}|[一-鿿]{2,4})对([一-鿿]{1,8})过敏/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawSubject = m[1];
    const substance = m[2];

    // Skip degenerate matches — substance must be at least one char
    // and not the standalone word "什么" / "啥" (questions).
    if (/^(什么|啥|这|那)$/.test(substance)) continue;

    let factText: string;
    let category: MemoryFact['category'];

    if (rawSubject === '我') {
      factText = `对${substance}过敏`;
      category = 'about-you';
    } else if (RELATION_RE.test(rawSubject)) {
      // Strip leading 我 if present so the fact reads naturally on
      // /memory ("女儿小雨对花生过敏" not "我女儿小雨对花生过敏").
      const cleanSubject = rawSubject.replace(/^我/, '');
      factText = `${cleanSubject}对${substance}过敏`;
      category = 'people';
    } else if (looksLikeName(rawSubject)) {
      factText = `${rawSubject}对${substance}过敏`;
      category = 'people';
    } else {
      // Doesn't look like a person and isn't 我 — skip to avoid
      // garbage facts like "东西对甜的过敏".
      continue;
    }

    if (seen.has(factText)) continue;
    seen.add(factText);

    out.push({
      text: factText,
      category,
      confidence: 0.95,
      source: m[0],
    });
  }

  return out;
}

/**
 * Detect `<subject>不能吃<food>` / `<subject>不吃<food>` mentions —
 * dietary restrictions adjacent to allergies but slightly weaker
 * signal (preference vs medical). Same category logic as allergies.
 */
function findDietaryRestrictions(text: string): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();

  const re =
    /(我|我?(?:女儿|儿子|老婆|老公|妻子|丈夫|妈妈|爸爸|妹妹|妹|姐姐|姐|弟弟|弟|哥哥|哥|孩子|宝宝|宝贝|闺女|小孩)[一-鿿]{0,4}|[一-鿿]{2,4})(不能吃|不吃|忌口)([一-鿿]{1,8})/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawSubject = m[1];
    const verb = m[2];
    const food = m[3];

    if (/^(什么|啥|这|那)$/.test(food)) continue;
    // "我不吃了" / "我不吃饭" — verb is fine, food is fragmentary
    if (food.length < 1) continue;

    let factText: string;
    let category: MemoryFact['category'];

    if (rawSubject === '我') {
      factText = `${verb}${food}`;
      category = 'about-you';
    } else if (RELATION_RE.test(rawSubject)) {
      const cleanSubject = rawSubject.replace(/^我/, '');
      factText = `${cleanSubject}${verb}${food}`;
      category = 'people';
    } else if (looksLikeName(rawSubject)) {
      factText = `${rawSubject}${verb}${food}`;
      category = 'people';
    } else {
      continue;
    }

    if (seen.has(factText)) continue;
    seen.add(factText);

    out.push({
      text: factText,
      category,
      // Slightly lower than allergies — preference, not medical.
      confidence: 0.9,
      source: m[0],
    });
  }

  return out;
}

/**
 * Detect "我是 <profile>" where profile is a known short identity.
 * Auto-save only for established identity tokens to avoid grabbing
 * sentence fragments like "我是说真的" or "我是想问".
 */
const IDENTITY_TOKENS = [
  '素食',
  '素食者',
  '吃素',
  '吃素的',
  '穆斯林',
  '回民',
  '佛教徒',
  '基督徒',
  '糖尿病患者',
  '高血压患者',
];

function findIdentityFacts(text: string): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();

  for (const token of IDENTITY_TOKENS) {
    const re = new RegExp(`我(?:是|吃)${token === '吃素' || token === '吃素的' ? '' : '|我'}${token}`);
    // Simpler: just check substring presence and that it's preceded by 我
    const idx = text.indexOf(token);
    if (idx <= 0) continue;
    // Require the immediately preceding char to be 我 or 是 (i.e. user
    // self-statement, not third-person description).
    const before = text.slice(Math.max(0, idx - 2), idx);
    if (!/我|是/.test(before)) continue;

    const factText = `我${token.startsWith('吃') ? '' : '是'}${token}`;
    if (seen.has(factText)) continue;
    seen.add(factText);
    out.push({
      text: factText,
      category: 'about-you',
      confidence: 0.9,
      source: token,
    });
    void re;
  }

  return out;
}

/**
 * Public entry — run all detectors and return their concatenated
 * candidates. Order matches detector priority (allergies first).
 */
export function extractMemoryCandidates(text: string): MemoryCandidate[] {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (trimmed.length < 4) return [];

  return [
    ...findAllergies(trimmed),
    ...findDietaryRestrictions(trimmed),
    ...findIdentityFacts(trimmed),
  ];
}

/**
 * Build the cross-intent recall prefix injected into outgoing
 * gateway messages. Only `about-you` / `people` / `preferences` are
 * surfaced — project-scoped facts stay scoped to their intent's
 * on-claw session memory instead. Empty string if nothing relevant.
 *
 * The prefix is bracketed so the agent treats it as background
 * context rather than echoing it back as if the user just typed it.
 */
export function buildMemoryContextPrefix(
  facts: MemoryFact[],
  displayName?: string | null,
): string {
  const relevant = facts.filter(
    (f) =>
      f.category === 'about-you' ||
      f.category === 'people' ||
      f.category === 'preferences',
  );

  const hasName = !!displayName;
  const hasFacts = relevant.length > 0;
  if (!hasName && !hasFacts) return '';

  const lines: string[] = [];

  if (hasName) {
    lines.push(`- 用户的名字是"${displayName}"，请直接用这个称呼他/她，不要再问叫什么名字。`);
  }

  if (hasFacts) {
    // Cap at 20 most-recent to keep the prefix small.
    const head = relevant.slice(0, 20);
    head.forEach((f) => lines.push(`- ${f.text}`));
  }

  return [
    '(以下是用户信息，请在合适场合考虑，不要复述给用户听:',
    ...lines,
    ')',
    '',
    '',
  ].join('\n');
}
