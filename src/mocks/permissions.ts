import type { Capability, CapabilityGrant } from './types';

export const capabilities: Capability[] = [
  // 读
  { id: 'read-calendar', label: '看你的日历', description: '知道你哪些时间忙、提醒不撞', group: 'read', sensitive: false, icon: '📅' },
  { id: 'read-mail', label: '看你的邮件', description: '从邮件里找航班、订单、发票', group: 'read', sensitive: true, icon: '📧' },
  { id: 'read-contacts', label: '看你的联系人', description: '帮你联系朋友 / 家人时认得名字', group: 'read', sensitive: true, icon: '👥' },
  { id: 'read-photos', label: '看你的照片', description: '在对话里引用你拍过的东西', group: 'read', sensitive: true, icon: '🖼️' },
  { id: 'read-wechat', label: '看微信聊天', description: '从微信里找你说过的话和图', group: 'read', sensitive: true, icon: '💬' },

  // 做
  { id: 'do-send-mail', label: '帮你发邮件', description: '替你回复或主动写邮件', group: 'do', sensitive: true, icon: '✉️' },
  { id: 'do-book-travel', label: '帮你订机票酒店', description: '直接帮你下订单(花钱前会问你)', group: 'do', sensitive: true, icon: '✈️' },
  { id: 'do-shop', label: '帮你下单购物', description: '比价后帮你买东西', group: 'do', sensitive: true, icon: '🛒' },
  { id: 'do-message', label: '帮你给联系人发消息', description: '比如帮你跟妈妈说一声', group: 'do', sensitive: true, icon: '📱' },
  { id: 'do-calendar', label: '帮你加日历提醒', description: '把约会、提醒写进你的日历', group: 'do', sensitive: false, icon: '🔔' },
  { id: 'do-notes', label: '帮你整理笔记', description: '记录、归档、写小结', group: 'do', sensitive: false, icon: '📝' },

  // 外部
  { id: 'ext-booking', label: 'Booking', description: '查酒店、订房', group: 'external', sensitive: false, icon: '🏨' },
  { id: 'ext-skyscanner', label: 'Skyscanner', description: '查机票', group: 'external', sensitive: false, icon: '🛫' },
  { id: 'ext-12306', label: '12306', description: '订火车票', group: 'external', sensitive: false, icon: '🚄' },
  { id: 'ext-meituan', label: '美团', description: '点外卖、订餐厅、本地服务', group: 'external', sensitive: false, icon: '🥡' },
  { id: 'ext-taobao', label: '淘宝 / 天猫', description: '比价、查商品', group: 'external', sensitive: false, icon: '🛍️' },
  { id: 'ext-alipay', label: '支付宝', description: '完成付款(花钱前都会问你)', group: 'external', sensitive: true, icon: '💳' },
];

export const capabilityGrants: CapabilityGrant[] = [
  { capabilityId: 'read-calendar', mode: 'allow' },
  { capabilityId: 'read-mail', mode: 'ask' },
  { capabilityId: 'read-contacts', mode: 'allow' },
  { capabilityId: 'read-photos', mode: 'ask' },
  { capabilityId: 'read-wechat', mode: 'deny' },

  { capabilityId: 'do-send-mail', mode: 'ask' },
  { capabilityId: 'do-book-travel', mode: 'ask' },
  { capabilityId: 'do-shop', mode: 'ask' },
  { capabilityId: 'do-message', mode: 'ask' },
  { capabilityId: 'do-calendar', mode: 'allow' },
  { capabilityId: 'do-notes', mode: 'allow' },

  { capabilityId: 'ext-booking', mode: 'allow' },
  { capabilityId: 'ext-skyscanner', mode: 'allow' },
  { capabilityId: 'ext-12306', mode: 'allow' },
  { capabilityId: 'ext-meituan', mode: 'allow' },
  { capabilityId: 'ext-taobao', mode: 'allow' },
  { capabilityId: 'ext-alipay', mode: 'ask' },
];
