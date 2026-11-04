import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { usePrefs } from '@/state/prefs';

export function RuntimeStatus() {
  const lang = usePrefs(s => s.lang);
  const { data, error, refetch } = useQuery({ queryKey: ['runtime'], queryFn: api.runtime, retry: false, staleTime: 60_000 });
  if (error) return <div role="alert" className="mb-5 rounded-2xl ring-1 ring-line bg-sand p-4 text-lg">
    <p>{lang === 'zh' ? '暂时连不上助手，您的事情还没有开始。' : 'The helper is unavailable. Your task has not started.'}</p>
    <button className="btn-soft mt-3" onClick={() => void refetch()}>{lang === 'zh' ? '重新连接' : 'Reconnect'}</button>
  </div>;
  if (!data?.scripted) return null;
  return <p role="note" className="mb-5 rounded-2xl bg-wait p-4 text-base">{lang === 'zh'
    ? '这是演示模式：回答和商品价格是预设示例，不会实际购买。'
    : 'Scripted demo: answers and prices are examples. No purchases are made.'}</p>;
}
