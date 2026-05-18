import type { Agent, HermesProfile } from './types';

/**
 * Mock OpenClaw agents — these would live per-claw in reality (47 agents on
 * cool-brook). We expose ~12 here, one per functional role surfaced in the
 * Phase 1 mock data.
 */
export const agents: Agent[] = [
  // OpenClaw — on cool-brook
  { key: 'researcher', source: 'openclaw', clawId: 'cool-brook', displayName: '研究员', emoji: '🔬', description: '查资料、读网页、整理信息', capabilityIds: [] },
  { key: 'planner', source: 'openclaw', clawId: 'cool-brook', displayName: '规划员', emoji: '🗺️', description: '把事情拆成步骤、定时间表', capabilityIds: ['do-calendar', 'do-notes'] },
  { key: 'flights', source: 'openclaw', clawId: 'cool-brook', displayName: '机票助手', emoji: '✈️', description: '比价、盯价格、提醒', capabilityIds: ['ext-skyscanner', 'do-book-travel'] },
  { key: 'lodging', source: 'openclaw', clawId: 'cool-brook', displayName: '住宿助手', emoji: '🏨', description: '酒店 / 民宿候选 + 订房', capabilityIds: ['ext-booking', 'do-book-travel'] },
  { key: 'meal-planner', source: 'openclaw', clawId: 'cool-brook', displayName: '吃饭助手', emoji: '🍳', description: '菜单、采购单、下单', capabilityIds: ['ext-meituan', 'do-notes'] },
  { key: 'tutor', source: 'openclaw', clawId: 'cool-brook', displayName: '陪练', emoji: '📚', description: '出题、批改、复习清单', capabilityIds: ['do-notes'] },
  { key: 'writer', source: 'openclaw', clawId: 'cool-brook', displayName: '写手', emoji: '✍️', description: '写文档、修改文字', capabilityIds: ['do-notes'] },
  { key: 'comparator', source: 'openclaw', clawId: 'cool-brook', displayName: '比价员', emoji: '⚖️', description: '多家报价 / 商品打表对比', capabilityIds: ['ext-taobao'] },
  { key: 'reminder', source: 'openclaw', clawId: 'cool-brook', displayName: '提醒员', emoji: '⏰', description: '定时和事件触发的助手', capabilityIds: ['do-calendar', 'read-calendar'] },
  { key: 'mail-reader', source: 'openclaw', clawId: 'cool-brook', displayName: '邮件助手', emoji: '📧', description: '从邮件抓订单、发票、行程', capabilityIds: ['read-mail'] },
  { key: 'shopper', source: 'openclaw', clawId: 'cool-brook', displayName: '购物员', emoji: '🛒', description: '下单 + 付款流程', capabilityIds: ['ext-taobao', 'ext-alipay', 'do-shop'] },
  { key: 'family-contact', source: 'openclaw', clawId: 'cool-brook', displayName: '家人联络员', emoji: '💞', description: '帮你跟家人发消息、说一声', capabilityIds: ['read-contacts', 'do-message'] },
];

/**
 * Mock Hermes profiles — one gateway process per persona/context.
 * Each profile picks a primary LLM provider + has its own env / allowlist.
 */
export const hermesProfiles: HermesProfile[] = [
  { key: 'assistant', displayName: '通用助手', description: '默认profile,日常对话和大部分任务', primaryProvider: 'openrouter' },
  { key: 'myclaw', displayName: 'MyClaw 自己', description: 'AIOS 内部使用,接 OpenClaw runtime', primaryProvider: 'anthropic' },
  { key: 'myinvest', displayName: '理财助手', description: '金融场景,数学严谨的模型', primaryProvider: 'anthropic' },
  { key: 'mytech', displayName: '技术助手', description: '写代码、读 stack trace', primaryProvider: 'anthropic' },
];

/**
 * Per-Intent agent binding — which agents + profile each Intent uses.
 * In real Phase 6 this lives in Supabase. The Engines page reads it; dev-mode
 * indicators in Intent home read it too.
 */
export const intentBindings: Record<string, { agentKeys: string[]; profileKey: string }> = {
  birthday: { agentKeys: ['planner', 'researcher', 'shopper'], profileKey: 'assistant' },
  sakura: { agentKeys: ['planner', 'researcher', 'flights', 'lodging'], profileKey: 'assistant' },
  'mom-phone': { agentKeys: ['planner', 'writer', 'family-contact'], profileKey: 'assistant' },
  dinner: { agentKeys: ['meal-planner', 'reminder', 'shopper'], profileKey: 'assistant' },
  japanese: { agentKeys: ['tutor', 'reminder'], profileKey: 'assistant' },
  'living-room': { agentKeys: ['comparator', 'researcher', 'reminder'], profileKey: 'assistant' },
  job: { agentKeys: ['writer', 'researcher', 'mail-reader'], profileKey: 'mytech' },
};
