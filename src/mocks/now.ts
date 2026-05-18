import type { Approval, NowActivity } from './types';

const NOW = new Date('2026-05-13T10:30:00+08:00');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();
const hoursAgo = (n: number) => minutesAgo(n * 60);

export const approvals: Approval[] = [
  {
    id: 'ap-sakura-1',
    intentId: 'sakura',
    prompt: '找到一张往返 ¥3,450 的票,在你的提醒线下面 50 块。要订吗?',
    detail: '春秋航空,4/5 早 7:45 出发,4/11 晚 21:30 回。两人合计 ¥6,900。',
    agentKey: 'flights',
    createdAt: minutesAgo(6),
    options: [
      { label: '再等等', kind: 'secondary' },
      { label: '订', kind: 'primary' },
    ],
  },
  {
    id: 'ap-living-1',
    intentId: 'living-room',
    prompt: '窗帘 A(¥2,800)还是 B(¥3,400)?',
    detail: 'A 是窄褶纯色,B 是带纹路加遮光层。两家都能 5/20 前装好。',
    agentKey: 'comparator',
    createdAt: hoursAgo(2),
    options: [
      { label: '选 A', kind: 'secondary' },
      { label: '选 B', kind: 'primary' },
    ],
  },
  {
    id: 'ap-dinner-1',
    intentId: 'dinner',
    prompt: '本周买菜清单我直接帮你下美团?',
    detail: '14 项菜品,约 ¥168,2 小时送达。',
    agentKey: 'shopper',
    createdAt: hoursAgo(20),
    options: [
      { label: '我自己去', kind: 'secondary' },
      { label: '帮我下', kind: 'primary' },
    ],
  },
];

export const nowActivities: NowActivity[] = [
  // awaiting_approval — mirror the approvals above; Now panel shows these on top
  {
    id: 'na-1',
    kind: 'awaiting_approval',
    intentId: 'sakura',
    summary: '找到一张 ¥3,450 的机票,要订吗?',
    agentKey: 'flights',
    since: minutesAgo(6),
    approvalId: 'ap-sakura-1',
  },
  {
    id: 'na-2',
    kind: 'awaiting_approval',
    intentId: 'living-room',
    summary: '窗帘选 A 还是 B?',
    agentKey: 'comparator',
    since: hoursAgo(2),
    approvalId: 'ap-living-1',
  },
  {
    id: 'na-3',
    kind: 'awaiting_approval',
    intentId: 'dinner',
    summary: '买菜清单要不要直接下美团?',
    agentKey: 'shopper',
    since: hoursAgo(20),
    approvalId: 'ap-dinner-1',
  },

  // running
  {
    id: 'na-4',
    kind: 'running',
    intentId: 'sakura',
    summary: '在盯 3 家航司的票价',
    agentKey: 'flights',
    since: hoursAgo(4),
  },
  {
    id: 'na-5',
    kind: 'running',
    intentId: 'japanese',
    summary: '在挑今天的复习题',
    agentKey: 'tutor',
    since: minutesAgo(40),
  },
  {
    id: 'na-6',
    kind: 'running',
    intentId: 'living-room',
    summary: '在帮你对比 3 家窗帘店报价',
    agentKey: 'comparator',
    since: hoursAgo(5),
  },

  // completed
  {
    id: 'na-7',
    kind: 'completed',
    intentId: 'mom-phone',
    summary: '写完了第 1 章「微信视频通话」',
    agentKey: 'writer',
    since: hoursAgo(3),
  },
  {
    id: 'na-8',
    kind: 'completed',
    intentId: 'dinner',
    summary: '本周菜单发到你微信了',
    agentKey: 'meal-planner',
    since: hoursAgo(20),
  },
  {
    id: 'na-9',
    kind: 'completed',
    intentId: 'sakura',
    summary: '整理好住宿候选 5 家',
    agentKey: 'lodging',
    since: hoursAgo(20),
  },
];
