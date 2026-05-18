import type { ScheduleEvent } from './types';

const NOW = new Date('2026-05-13T10:30:00+08:00');
const hoursFromNow = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const daysFromNow = (n: number) => hoursFromNow(n * 24);

export const scheduleEvents: ScheduleEvent[] = [
  {
    id: 's-sakura-price',
    intentId: 'sakura',
    title: '盯一下樱花机票价格',
    fireAt: hoursFromNow(9), // 今晚 19:30
    status: 'pending',
  },
  {
    id: 's-jp-review',
    intentId: 'japanese',
    title: '今天的日语复习',
    fireAt: hoursFromNow(11), // 今晚
    recurrence: { kind: 'daily', spec: '21:30', label: '每天 21:30' },
    status: 'pending',
  },
  {
    id: 's-dinner-shop',
    intentId: 'dinner',
    title: '周三去买菜',
    fireAt: hoursFromNow(31), // 明晚下班
    recurrence: { kind: 'weekly', spec: 'wed 17:30', label: '每周三 17:30' },
    status: 'pending',
  },
  {
    id: 's-living-room-visit',
    intentId: 'living-room',
    title: '装修师傅来量尺寸',
    fireAt: daysFromNow(2), // 5/15
    status: 'pending',
  },
  {
    id: 's-mom-birthday',
    intentId: 'mom-phone',
    title: '妈妈生日 — 提前买礼物',
    fireAt: daysFromNow(6),
    status: 'pending',
  },
  {
    id: 's-sakura-checkin',
    intentId: 'sakura',
    title: '航班价格周报',
    fireAt: daysFromNow(7),
    recurrence: { kind: 'weekly', spec: 'mon 09:00', label: '每周一早上' },
    status: 'pending',
  },
  {
    id: 's-job-resume',
    intentId: 'job',
    title: '看一眼简历 v3',
    fireAt: daysFromNow(14),
    status: 'pending',
  },
];
