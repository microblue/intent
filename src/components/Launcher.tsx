import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUI } from '@/state/ui';
import { messages, files } from '@/mocks';
import { useIntents } from '@/data/useIntents';

export function Launcher() {
  const open = useUI((s) => s.launcherOpen);
  const setOpen = useUI((s) => s.setLauncherOpen);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { intents: launcherIntents } = useIntents();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUI.getState().launcherOpen);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Reset query when the launcher closes so reopen feels fresh.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (!open) return null;

  const go = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  const goNewWithSeed = (seed: string) => {
    setOpen(false);
    navigate({ to: '/new', search: { seed } });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[min(640px,92vw)] overflow-hidden rounded-2xl bg-base-100 shadow-2xl ring-1 ring-base-300"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="全局搜索" loop>
          <div className="flex items-center gap-3 border-b border-base-300/60 px-4 py-3.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-base-content/50"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="搜你最近聊过的事、文件、或者就告诉我你想做什么……"
              className="flex-1 bg-transparent text-base placeholder:text-base-content/40 focus:outline-none"
            />
            <kbd className="rounded-md bg-base-200 px-1.5 py-0.5 text-[0.8125rem] font-medium text-base-content/60">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty>
              {query.trim() ? (
                <button
                  type="button"
                  onClick={() => goNewWithSeed(query)}
                  className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-primary/10 px-3.5 py-3 text-left text-sm ring-1 ring-primary/30 hover:bg-primary/15"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-content text-base">
                    ✨
                  </span>
                  <span className="flex-1">
                    <div className="text-sm font-medium">开始一件新事情</div>
                    <div className="truncate text-[0.875rem] text-base-content/60">「{query}」</div>
                  </span>
                </button>
              ) : (
                <span>试试搜索,或直接告诉我你想做什么。</span>
              )}
            </Command.Empty>

            {query.trim() && (
              <Command.Group heading="动手做点新的">
                <Command.Item value={`new ${query}`} onSelect={() => goNewWithSeed(query)}>
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-content text-base">
                    ✨
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      开始一件新事情:「{query}」
                    </div>
                    <div className="truncate text-xs text-base-content/55">
                      我会先问你两句、确定方向,再开项目
                    </div>
                  </div>
                </Command.Item>
              </Command.Group>
            )}

            <Command.Group heading="你的项目">
              {launcherIntents.map((it) => (
                <Command.Item
                  key={it.id}
                  value={`intent ${it.title} ${it.preview}`}
                  onSelect={() => go(`/intent/${it.id}`)}
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-lg text-lg shadow-sm"
                    style={{ background: it.cover }}
                  >
                    {it.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.title}</div>
                    <div className="truncate text-xs text-base-content/60">{it.preview}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="最近的对话">
              {messages
                .filter((m) => m.role === 'user')
                .slice(0, 5)
                .map((m) => {
                  const text = m.content.find((p) => p.type === 'text');
                  if (!text || text.type !== 'text') return null;
                  return (
                    <Command.Item
                      key={m.id}
                      value={`msg ${text.text}`}
                      onSelect={() => go(`/intent/${m.intentId}`)}
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-base-200 text-base-content/60">
                        💬
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{text.text}</div>
                      </div>
                    </Command.Item>
                  );
                })}
            </Command.Group>

            <Command.Group heading="文件">
              {files.slice(0, 5).map((f) => (
                <Command.Item
                  key={f.id}
                  value={`file ${f.name} ${f.preview}`}
                  onSelect={() => go(`/intent/${f.intentId}`)}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-base-200 text-base-content/70">
                    {f.kind === 'doc' ? '📄' : f.kind === 'image' ? '🖼️' : '🔗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="truncate text-xs text-base-content/60">{f.preview}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-base-300/60 px-4 py-2.5 text-xs text-base-content/55">
            <span>↑↓ 切换 · ↵ 打开</span>
            <span>试试问:"帮我订机票"</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
