/**
 * The 12 built-in OpenClaw agents provisioned on every claw.
 *
 * Source of truth for: AgentPicker options, per-message display
 * (emoji + name in chat headers), /new wizard recommendations,
 * and the intent team panel. Each entry mirrors the agent's
 * IDENTITY.md on the claw side (Name + Emoji + Role).
 *
 * The id is the OpenClaw `agentId` used in sessions.create.
 */

export interface BuiltinAgent {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** Lay-user-friendly one-liner about what they're for. */
  pitch: string;
  /** Intent keywords that should auto-recommend this agent. */
  keywords?: readonly string[];
}

export const BUILTIN_AGENTS: readonly BuiltinAgent[] = [
  {
    id: 'main',
    name: 'Claw',
    emoji: '🦞',
    desc: '通用助手,什么都能聊',
    pitch: '万事先找他,他会决定要不要叫别的助手帮忙',
  },
  {
    id: 'researcher',
    name: '研究员',
    emoji: '🔬',
    desc: '查资料 / 读网页 / 整理信息',
    pitch: '找资料 + 给你出处。不知道的事会直说,不瞎编',
    keywords: ['查', '资料', '研究', '了解', '科普', '比较', '调研'],
  },
  {
    id: 'planner',
    name: '规划员',
    emoji: '🗺️',
    desc: '把事情拆成步骤 + 时间表',
    pitch: '帮你把"想做的事"拆成 3-5 步,每步给时间和优先级',
    keywords: ['计划', '规划', '安排', '日程', '清单', '步骤'],
  },
  {
    id: 'writer',
    name: '写手',
    emoji: '✍️',
    desc: '写文档 / 改文字',
    pitch: '草稿 + 改稿。给你两个版本,你挑方向再细化',
    keywords: ['写', '稿', '文章', '邮件', '简历', '改', '润色'],
  },
  {
    id: 'flights',
    name: '机票助手',
    emoji: '✈️',
    desc: '比价 + 盯价格',
    pitch: '同一条航线给 3 个选项:最便宜 / 不红眼 / 性价比',
    keywords: ['机票', '航班', '飞', '出发', '旅行', '订票'],
  },
  {
    id: 'lodging',
    name: '住宿助手',
    emoji: '🏨',
    desc: '酒店 / 民宿候选 + 订房',
    pitch: '候选 + 差评摘要,让你看见最坏的情况再决定',
    keywords: ['酒店', '住宿', '民宿', '订房', 'Airbnb', '旅行'],
  },
  {
    id: 'mealplanner',
    name: '吃饭助手',
    emoji: '🍳',
    desc: '菜单 / 采购清单',
    pitch: '问清几人 / 忌口 / 预算,出菜单 + 按超市分区的购物单',
    keywords: ['吃', '菜单', '做饭', '食材', '采购', '一日三餐'],
  },
  {
    id: 'tutor',
    name: '陪练',
    emoji: '📚',
    desc: '出题 / 批改 / 复习清单',
    pitch: '讲解先一句话核心 → 细节 → 留题让你练',
    keywords: ['学', '考', '练', '复习', '功课', '英语', '日语', '题'],
  },
  {
    id: 'comparator',
    name: '比价员',
    emoji: '⚖️',
    desc: '多商品对比表',
    pitch: '直接出对比表:价格 / 关键差异 / 适合谁用',
    keywords: ['对比', '比较', '哪个好', '推荐', '挑'],
  },
  {
    id: 'reminder',
    name: '提醒员',
    emoji: '⏰',
    desc: '定时和事件触发',
    pitch: '把"下周三"翻译成具体日期 + 时区,定下不漏',
    keywords: ['提醒', '记得', '别忘', '到时候', '每天', '每周'],
  },
  {
    id: 'mailreader',
    name: '邮件助手',
    emoji: '📧',
    desc: '从邮件抽订单 / 行程',
    pitch: '把邮件分成"要我做的 / 存档 / 删",订单 + 票据自动提取',
    keywords: ['邮件', '收件箱', '订单', '发票', 'gmail'],
  },
  {
    id: 'shopper',
    name: '购物员',
    emoji: '🛒',
    desc: '下单 + 付款流程',
    pitch: '下单前必复述商品 + 价 + 地址,等你确认',
    keywords: ['买', '下单', '购物', '付', '购买'],
  },
  {
    id: 'familycontact',
    name: '家人联络员',
    emoji: '💞',
    desc: '帮你给家人发消息',
    pitch: '草拟给妈 / 爸 / 老婆的话,语气贴合关系',
    keywords: ['家人', '老婆', '老公', '妈妈', '爸爸', '生日', '节日', '问候'],
  },
];

export const DEFAULT_AGENT_ID = 'main';

const BY_ID = new Map(BUILTIN_AGENTS.map((a) => [a.id, a]));

export function findBuiltinAgent(id: string | null | undefined): BuiltinAgent | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

/**
 * Recommend a team of 2-3 agents for a new intent based on the user's
 * prompt. Always includes `main` as orchestrator + up to 2 specialists
 * matched by keyword. Used by /new wizard.
 */
export function recommendAgentTeam(prompt: string): string[] {
  const text = prompt.toLowerCase();
  const matches: { id: string; score: number }[] = [];
  for (const a of BUILTIN_AGENTS) {
    if (a.id === 'main' || !a.keywords) continue;
    let score = 0;
    for (const kw of a.keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    if (score > 0) matches.push({ id: a.id, score });
  }
  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, 2).map((m) => m.id);
  return ['main', ...top];
}
