import type { MemoryFact } from './types';

const ago = (days: number) =>
  new Date(new Date('2026-05-13T10:30:00+08:00').getTime() - days * 86_400_000).toISOString();

export const memoryFacts: MemoryFact[] = [
  // 关于你
  { id: 'mf-1', category: 'about-you', text: '住在上海,工作日通勤地铁 2 号线', createdAt: ago(120) },
  { id: 'mf-2', category: 'about-you', text: '生日 11/23', createdAt: ago(180) },
  { id: 'mf-3', category: 'about-you', text: '工作:产品经理,常出差', createdAt: ago(100) },
  { id: 'mf-4', category: 'about-you', text: '微信支付绑了招行卡', createdAt: ago(60) },

  // 偏好
  { id: 'mf-5', category: 'preferences', text: '机票偏好早班,落地能玩半天', originIntentId: 'sakura', createdAt: ago(2) },
  { id: 'mf-6', category: 'preferences', text: '咖啡:拿铁,不加糖', createdAt: ago(45) },
  { id: 'mf-7', category: 'preferences', text: '旅行不爱跟团,自由行', originIntentId: 'sakura', createdAt: ago(30) },
  { id: 'mf-8', category: 'preferences', text: '吃辣可以,但不要太麻', originIntentId: 'dinner', createdAt: ago(80) },
  { id: 'mf-9', category: 'preferences', text: '预算敏感:5000 以下不犹豫,以上要比', createdAt: ago(70) },

  // 重要的人
  { id: 'mf-10', category: 'people', text: '老婆 Lisa — 在阿里做设计', createdAt: ago(200) },
  { id: 'mf-11', category: 'people', text: '妈妈 王秀英 — 5/19 生日,刚换华为手机', originIntentId: 'mom-phone', createdAt: ago(4) },
  { id: 'mf-12', category: 'people', text: '爸爸 — 退休,糖尿病,饮食要控糖', createdAt: ago(90) },
  { id: 'mf-13', category: 'people', text: '同事 Alex — 跟我抢樱花机票同一档期,可以一起买', originIntentId: 'sakura', createdAt: ago(1) },

  // 项目相关
  { id: 'mf-14', category: 'project', text: '京都旅行预算 ¥20,000(含机酒和当地)', originIntentId: 'sakura', createdAt: ago(2) },
  { id: 'mf-15', category: 'project', text: '客厅装修预算 ¥30,000,窗帘单独 ¥3,000', originIntentId: 'living-room', createdAt: ago(5) },
  { id: 'mf-16', category: 'project', text: '日语:N3 目标 6 月底考', originIntentId: 'japanese', createdAt: ago(20) },
  { id: 'mf-17', category: 'project', text: '换工作偏好:AI infra / 内容产品方向', originIntentId: 'job', createdAt: ago(8) },
];
