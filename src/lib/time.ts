// Lay-user-friendly "时间感",不是 ISO 也不是 "2 hours ago" 这种英文味。
// 锚定到 mock 数据里使用的 "now",这样原型时间感稳定。
const MOCK_NOW = new Date('2026-05-13T10:30:00+08:00').getTime();

export function timeAgo(iso: string, now: number = MOCK_NOW): string {
  const t = new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round((now - t) / 60_000));
  if (diffMin < 2) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay === 1) return '昨天';
  if (diffDay < 7) return `${diffDay} 天前`;
  if (diffDay < 30) return `${Math.round(diffDay / 7)} 周前`;
  return `${Math.round(diffDay / 30)} 个月前`;
}
