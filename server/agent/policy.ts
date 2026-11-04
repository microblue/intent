/**
 * Hard rules enforced on the server, regardless of what the model asks for.
 * The prompt also tells the model about them, but the model is never trusted
 * to enforce them by itself.
 */
import type { ApprovalPayload, Lang, Profile, PurchaseCategory } from '../../shared/types';

const FORBIDDEN_CATEGORIES: PurchaseCategory[] = ['gift_card', 'money_transfer', 'investment', 'loan'];

/** Keyword net for things the model may mislabel as "goods". */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /gift\s*card|prepaid\s*card|itunes\s*card|google\s*play\s*card|steam\s*card|vanilla\s*(visa|card)/i,
  /礼品卡|购物卡|充值卡|点卡|储值卡|预付卡/,
  /wire\s*transfer|western\s*union|moneygram|zelle|venmo|cash\s*app|paypal\s*(friends|send)/i,
  /转账|汇款|打款|借给|借钱/,
  /bitcoin|crypto|btc|eth\b|usdt|stock|shares\b|etf\b/i,
  /比特币|加密货币|虚拟币|股票|基金|理财产品|贷款/,
];

export type PolicyResult = { ok: true } | { ok: false; reason: string };

export function checkPurchase(
  p: Pick<ApprovalPayload, 'item' | 'merchant' | 'amountCents' | 'category' | 'currency'>,
  profile: Profile,
  lang: Lang,
): PolicyResult {
  const zh = lang === 'zh';
  const haystack = `${p.item} ${p.merchant}`;
  if (FORBIDDEN_CATEGORIES.includes(p.category) || FORBIDDEN_PATTERNS.some((r) => r.test(haystack))) {
    return {
      ok: false,
      reason: zh
        ? '这件事在「永远不做」的清单上：礼品卡、充值卡、转账汇款、借贷和投资，我都不会替您做。很多骗局就是让人买这些。'
        : "This is on my never-do list: gift cards, prepaid cards, money transfers, loans and investments. Many scams ask for exactly these, so I won't do them for you.",
    };
  }
  if (!Number.isFinite(p.amountCents) || p.amountCents <= 0) {
    return { ok: false, reason: zh ? '价格不清楚，我先不帮您买。' : "The price isn't clear, so I won't buy it yet." };
  }
  if (p.amountCents > profile.perPurchaseLimitCents) {
    return {
      ok: false,
      reason: zh
        ? `这笔超过了您设的每笔上限 ${money(profile.perPurchaseLimitCents, p.currency)}。想买的话，可以在「我的 → 它能替我做什么」里把上限调高。`
        : `This is over your per-purchase limit of ${money(profile.perPurchaseLimitCents, p.currency)}. You can raise it in Me → What Intent can do.`,
    };
  }
  if (profile.spentThisMonthCents + p.amountCents > profile.monthlyLimitCents) {
    return {
      ok: false,
      reason: zh
        ? `这笔会超过您这个月的上限 ${money(profile.monthlyLimitCents, p.currency)}。可以在「我的」里调高。`
        : `This would go over your monthly limit of ${money(profile.monthlyLimitCents, p.currency)}. You can raise it in Me.`,
    };
  }
  return { ok: true };
}

export function money(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
