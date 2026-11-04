import type { Lang } from '../../shared/types';

/** Server-side status lines and messages, in the user's language. */
export function serverText(lang: Lang) {
  return lang === 'zh' ? zh : en;
}

const zh = {
  yourTurn: '等您回话',
  planReady: '计划好了，等您同意',
  searchingShort: '正在网上查',
  resultReady: '结果出来了',
  needsApproval: '找到了，等您点头',
  stopped: '先停下了',
  declined: '好的，不买了。',
  errorRetry: '刚才网络不太好，我没做完。您再说一次，或者点「再试一次」。',
  errorGeneric: '刚才出了点问题，我没做完。请再说一次试试。',
  thinking: '我想想…',
  paid: '我付好了。',
  waitingPay: '等您付款',
};

const en: typeof zh = {
  yourTurn: 'Your turn',
  planReady: 'Plan ready — waiting for your OK',
  searchingShort: 'Looking it up online',
  resultReady: 'Results are ready',
  needsApproval: 'Found it — waiting for your OK',
  stopped: 'Paused',
  declined: "OK, I won't buy it.",
  errorRetry: "The connection dropped and I didn't finish. Please say it again, or tap Try again.",
  errorGeneric: "Something went wrong and I didn't finish. Please try saying it again.",
  thinking: 'Let me think…',
  paid: "I've paid.",
  waitingPay: 'Waiting for you to pay',
};
