/**
 * Canonical terminology table for MyClaw AIOS.
 *
 * Two rules, applied everywhere:
 *
 *   1. Lay-user UI uses the `zh` term as the primary label.
 *   2. Wherever the concept is *named* (ribbon chip, page header, section
 *      title, glossary, engines page), the English `en` term appears as
 *      secondary text in the same place. Same separator, same muted style.
 *
 * Why the redundancy: a user who learns 「助手」 on Intent home should be
 * able to read "Agent Runtime" on the Engines page and connect them — that
 * only works if every label everywhere shows both halves of the mapping in
 * lockstep. One table, one pattern; if you find yourself naming a concept
 * outside this file, add it here first.
 */

export type TermKey =
  | 'intent'
  | 'agent'
  | 'step'
  | 'capability'
  | 'memory'
  | 'schedule'
  | 'approval'
  | 'file'
  | 'outline'
  | 'activity'
  | 'engine';

export type TermEntry = {
  /** Friendly Chinese word used as the primary label across the app. */
  zh: string;
  /** Technical English name used as secondary label + as the canonical term in docs/code. */
  en: string;
  /** Emoji for icon-led chips & cards. */
  emoji: string;
  /** One-sentence definition. Glossary uses this verbatim. */
  definition: string;
  /** Where the user sees this concept materialise. */
  shownIn: string[];
  /** Optional: where in the app to land for the live view. */
  to?: string;
};

export const TERMS: Record<TermKey, TermEntry> = {
  intent: {
    zh: '想做的事',
    en: 'Intent',
    emoji: '🎯',
    definition:
      '一件你想 MyClaw 帮你做完的事 —— 一次旅行、一份简历、一个晚饭周计划。一个想做的事有自己的对话、计划、文件和助手团队。「想做的事」既是你想做的事,也是 MyClaw 帮你跑这件事的工作台。',
    shownIn: ['首页大卡片', '搜索结果', '提醒页里的归属', '记得的事页里的来源'],
    to: '/',
  },
  agent: {
    zh: '助手',
    en: 'Agent',
    emoji: '🤝',
    definition:
      '帮你做具体一类活儿的小员工。研究员管查资料、机票助手管比价、写手管写东西。一个项目里通常有几位助手在协作。',
    shownIn: ['Intent home 概念彩带「助手」chip', '聊天里步骤气泡的头像和名字', '助手们 popover'],
  },
  step: {
    zh: '步骤',
    en: 'Step',
    emoji: '✅',
    definition:
      '助手为了回答一句话所做的动作:查了什么、调了什么、比了什么。每条回复底下能看到几条步骤。',
    shownIn: ['聊天助手消息底下的灰色小条', 'Now panel 「正在做」', '助手们 popover 里的现在状态'],
  },
  capability: {
    zh: '权限',
    en: 'Capability',
    emoji: '🛡️',
    definition:
      '助手能动你哪些资料、能调哪些第三方服务。看日历、发邮件、订机票、下单 —— 每条都可以开关或者改成「每次问」。',
    shownIn: ['「助手能做什么」页', '聊天里 ✦ 「用了…」chip'],
    to: '/permissions',
  },
  memory: {
    zh: '记得的事',
    en: 'Memory',
    emoji: '🧠',
    definition:
      '跨项目通用的小事实:你喜欢早班机、老婆叫 Lisa、妈妈生日 5/19。助手会在用得上的时候顺手用上。',
    shownIn: ['「助手记得你的事」页', '聊天回复上方 💭 「我记得你提过」注解'],
    to: '/memory',
  },
  schedule: {
    zh: '提醒',
    en: 'Schedule',
    emoji: '🔔',
    definition:
      '到点或按事件触发的小动作:每周三买菜、5/15 装修师傅来量尺寸、机票价格降到 3500 提醒一声。',
    shownIn: ['「提醒」页', '概念彩带里 🔔 chip'],
    to: '/schedule',
  },
  approval: {
    zh: '等你点头',
    en: 'Approval',
    emoji: '⚠️',
    definition:
      '助手要替你花钱、替你给别人发消息这类事,都会先停下来问你 OK 不 OK。任何敏感操作都走这一步。',
    shownIn: ['顶部铃图标(带红色徽章)', 'Now panel「等你点头」区', 'Intent 卡片上的橙色徽章'],
  },
  file: {
    zh: '文件',
    en: 'File',
    emoji: '📁',
    definition:
      '聊着聊着,助手做出来的东西:行程草稿、菜单、报价对比表、简历版本……都放在这儿,随时翻。',
    shownIn: ['Intent home 右侧「文件」pane', '概念彩带 📁 chip', 'Cmd+K 搜索结果'],
  },
  outline: {
    zh: '进度',
    en: 'Outline',
    emoji: '☑',
    definition:
      '这件事拆出来的步骤清单 —— 哪些已经做完、哪些还在跑。可以理解为「这个项目的 to-do」。',
    shownIn: ['Intent home 左侧「进度」pane(桌面)/ 标签页(移动)', '概念彩带 ☑ chip'],
  },
  activity: {
    zh: '正在做的事',
    en: 'Activity',
    emoji: '🛎️',
    definition:
      '跨项目的实时动态:哪几位助手正在干活、哪几件事等你点头、刚刚做完了什么。',
    shownIn: ['顶部铃图标点开的「正在为你做的事」侧栏'],
  },
  engine: {
    zh: '引擎',
    en: 'Engine',
    emoji: '⚙️',
    definition:
      '底层跑助手的两个东西:OpenClaw(助手的"工厂")和 Hermes(给助手接 LLM 的路由)。普通使用看不到,开发者模式下能看。',
    shownIn: ['「底层引擎」页(开发者模式)'],
    to: '/settings/engines',
  },
};

/**
 * Inline-secondary English label. Use immediately after the friendly word so
 * the pair reads as one phrase: `<span>助手</span><TermSecondary k="agent" />`.
 */
export function termSecondary(k: TermKey): string {
  return TERMS[k].en;
}
