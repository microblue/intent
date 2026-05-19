import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import {
  bindingsFor,
  conceptCountsFor,
  filesFor,
  findAgent,
  findCapability,
  findMemoryFact,
  hermesProfiles,
  memoryFacts,
  messagesFor,
  outlineFor,
  scheduleEvents,
  threadOutlineFor,
  tracesForMessage,
  nowActivities,
  type Intent,
  type IntentFile,
  type Message,
  type OutlineNode,
  type OutlineStep,
  type ThreadOutlineEntry,
} from '@/mocks';
import { useIntent } from '@/data/useIntents';
import { useUpdateIntent } from '@/data/useUpdateIntent';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/cn';
import { ALL_RAIL_SECTIONS, useUI, type RailSectionKey } from '@/state/ui';
import { useIsDesktop } from '@/lib/useMediaQuery';

/**
 * Intent home — branches by viewport because phone and desktop want
 * fundamentally different paradigms, not the same layout at different sizes.
 *
 *   Desktop  → "封面卡" opened up: cover + stats + collapsible outline/files
 *              + chat inline (everything visible at once on a wide canvas)
 *
 *   Mobile   → iMessage-shaped: thin gradient header + chat full-bleed +
 *              fixed composer. All metadata (stats / outline / files) lives
 *              in a bottom-sheet, one tap away. Mirrors how iOS / Android
 *              chat apps allocate the screen: content first, chrome away.
 */
export function IntentHomePage() {
  const { intentId } = useParams({ strict: false }) as { intentId: string };
  const { intent, isLoading, notFound, error } = useIntent(intentId);
  const isDesktop = useIsDesktop();
  // useChatThread keeps message state local; until the messages table
  // lands in the canonical schema we don't have a real source to swap to.
  const chat = useChatThread(intentId);

  if (isLoading) {
    return <IntentHomeSkeleton />;
  }

  if (error) {
    return (
      <div
        data-testid="intent-error"
        className="mx-auto mt-24 max-w-md px-6 text-center"
      >
        <div className="text-5xl">😵</div>
        <h1 className="mt-4 text-lg font-semibold">加载出错了</h1>
        <p className="mt-1 text-sm text-base-content/60">
          {error.message ?? '稍等一下再试。'}
        </p>
        <Link to="/" className="btn btn-ghost btn-sm mt-4">
          回到首页
        </Link>
      </div>
    );
  }

  if (notFound || !intent) {
    return (
      <div
        data-testid="intent-notfound"
        className="mx-auto mt-24 max-w-md px-6 text-center"
      >
        <div className="text-5xl">🤔</div>
        <h1 className="mt-4 text-lg font-semibold">没找到这个项目</h1>
        <p className="mt-1 text-sm text-base-content/60">
          可能链接过期了。
          <Link to="/" className="text-primary hover:underline">
            回到首页
          </Link>
          看看?
        </p>
      </div>
    );
  }

  const outline = outlineFor(intent.id);
  const files = filesFor(intent.id);

  return isDesktop ? (
    <DesktopIntentHome
      intent={intent}
      msgs={chat.messages}
      typing={chat.typing}
      onSend={chat.send}
      outline={outline}
      files={files}
    />
  ) : (
    <MobileIntentHome
      intent={intent}
      msgs={chat.messages}
      typing={chat.typing}
      onSend={chat.send}
      outline={outline}
      files={files}
    />
  );
}

/**
 * useChatThread — local-state chat loop on top of mock seed messages.
 *
 * Phase 1 mock: keyword-based reflection so the composer doesn't feel
 * dead. The reply lands after a ~1s delay with a typing indicator. Phase
 * 6 swaps this for a real WebSocket stream from the gateway.
 */
function useChatThread(intentId: string) {
  const seed = useMemo(() => messagesFor(intentId), [intentId]);
  const [extra, setExtra] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);

  const messages = useMemo(() => [...seed, ...extra], [seed, extra]);

  const send = (text: string) => {
    const now = new Date().toISOString();
    const userMsg: Message = {
      id: `m-user-${Date.now()}`,
      intentId,
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt: now,
    };
    setExtra((prev) => [...prev, userMsg]);
    setTyping(true);

    const delay = 900 + Math.random() * 400;
    window.setTimeout(() => {
      const reply: Message = {
        id: `m-asst-${Date.now()}`,
        intentId,
        role: 'assistant',
        content: [{ type: 'text', text: mockReply(text) }],
        createdAt: new Date().toISOString(),
      };
      setExtra((prev) => [...prev, reply]);
      setTyping(false);
    }, delay);
  };

  return { messages, typing, send };
}

function mockReply(userText: string): string {
  const t = userText.toLowerCase();
  if (/^(怎么|什么|为什么|哪|谁|是不是|能不能)/.test(userText) || t.includes('?') || t.includes('?')) {
    return '让我想想。\n\n我列两个角度,你看哪个对得上 ——\n• 角度 A:[针对这件事的快速判断]\n• 角度 B:[需要更多上下文才能定]\n\n你倾向哪个?或者再补充几句?';
  }
  if (t.includes('帮我') || t.includes('做') || t.includes('准备') || t.includes('安排')) {
    return '收到 ✓\n\n我先这样推进:\n\n1. 收集相关材料\n2. 出个初稿\n3. 改到你满意为止\n\n大概需要一两天。中间遇到要决定的事我会问你。';
  }
  if (t.includes('谢谢') || t.includes('thanks') || t.includes('好的')) {
    return '不客气 💫 有别的事告诉我。';
  }
  if (t.includes('改') || t.includes('换') || t.includes('不行') || t.includes('重新')) {
    return '好,我换个思路再试。\n\n你刚才说的是想往哪个方向调?给我一个关键词或例子就行,我立刻去改。';
  }
  return '懂了,我记下来了。\n\n等我整理一下,有进展就告诉你 ——\n(目前是演示版,真实助手会在 Phase 6 接入)';
}

/* ═══════════════════════════════════════════════════════════════════════════
   Mobile — iMessage-shaped: thin header + chat + fixed composer + info sheet
   ═══════════════════════════════════════════════════════════════════════════ */

function MobileIntentHome({
  intent,
  msgs,
  typing,
  onSend,
  outline,
  files,
}: {
  intent: Intent;
  msgs: Message[];
  typing: boolean;
  onSend: (text: string) => void;
  outline: OutlineNode[];
  files: IntentFile[];
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const counts = conceptCountsFor(intent.id);
  const navigate = useNavigate();

  return (
    <div className="relative bg-base-100">
      {/* Thin sticky header with intent-gradient backdrop */}
      <header
        className="sticky top-0 z-20 overflow-hidden"
        style={{ background: intent.cover }}
      >
        <div className="absolute inset-0 bg-black/15" />
        <div className="relative px-3 py-2.5 text-white">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/25 backdrop-blur-md hover:bg-black/35"
              aria-label="返回首页"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <span className="text-2xl drop-shadow-sm" aria-hidden>
              {intent.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <MobileTitleEdit intent={intent} />
              <div className="truncate text-[0.8125rem] text-white/75 leading-tight">
                {timeAgo(intent.lastActiveAt)} · {intent.preview}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/25 backdrop-blur-md hover:bg-black/35"
              aria-label="项目详情"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
          </div>

          {/* Urgent: pending approvals banner (only when there are any) */}
          {counts.pendingApprovals > 0 && (
            <button
              type="button"
              onClick={() => navigate({ to: '/now' })}
              className="mt-2 flex w-full items-center gap-2 rounded-full bg-warning px-3 py-1.5 text-xs font-medium text-warning-content shadow-sm"
            >
              <span aria-hidden>⚠️</span>
              <span>{counts.pendingApprovals} 件等你点头</span>
              <span className="ml-auto">›</span>
            </button>
          )}
        </div>
      </header>

      {/* Chat — fills the rest, scrolls naturally */}
      <main className="px-3 pb-32 pt-4">
        <div className="flex flex-col gap-4">
          {msgs.length === 0 ? (
            <EmptyChat />
          ) : (
            msgs.map((m) => <ChatMessage key={m.id} message={m} />)
          )}
          {typing && <TypingIndicator />}
        </div>
      </main>

      <StickyComposer onSend={onSend} />

      <InfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        intent={intent}
        outline={outline}
        files={files}
      />
    </div>
  );
}

function InfoSheet({
  open,
  onClose,
  intent,
  outline,
  files,
}: {
  open: boolean;
  onClose: () => void;
  intent: Intent;
  outline: OutlineNode[];
  files: IntentFile[];
}) {
  const counts = conceptCountsFor(intent.id);
  const navigate = useNavigate();
  const devMode = useUI((s) => s.devMode);
  const bind = bindingsFor(intent.id);
  const profile = bind ? hermesProfiles.find((p) => p.key === bind.profileKey) : undefined;

  return (
    <dialog className={cn('modal modal-bottom', open && 'modal-open')}>
      <div className="modal-box max-h-[85vh] overflow-y-auto rounded-t-2xl p-0">
        {/* Drag handle */}
        <div className="sticky top-0 z-10 flex justify-center bg-base-100 pb-2 pt-2.5">
          <div className="h-1 w-12 rounded-full bg-base-300" />
        </div>

        {/* Sheet header */}
        <header className="flex items-center gap-3 px-5 pb-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl shadow-sm"
            style={{ background: intent.cover }}
          >
            {intent.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[0.8125rem] uppercase tracking-wider text-base-content/45">
                想做的事
              </span>
              {intent.lifecycle === 'pinned' && (
                <span className="badge badge-ghost badge-xs">置顶</span>
              )}
            </div>
            <div className="truncate text-sm font-semibold">{intent.title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-circle btn-ghost btn-sm"
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        {/* Stats grid — 2 columns, compact */}
        <div className="grid grid-cols-2 gap-2 px-5 pb-4 sm:grid-cols-3">
          <SheetStat icon="🤝" title="助手" value={counts.agents} />
          <SheetStat icon="☑" title="进度" value={`${counts.outlineDone}/${counts.outlineTotal}`} />
          <SheetStat icon="📁" title="文件" value={counts.files} />
          {counts.schedule > 0 && (
            <SheetStat
              icon="🔔"
              title="提醒"
              value={counts.schedule}
              onClick={() => {
                onClose();
                navigate({ to: '/schedule' });
              }}
            />
          )}
          {counts.memoryFacts > 0 && (
            <SheetStat
              icon="🧠"
              title="记得"
              value={counts.memoryFacts}
              onClick={() => {
                onClose();
                navigate({ to: '/memory' });
              }}
            />
          )}
          {counts.pendingApprovals > 0 && (
            <SheetStat
              icon="⚠️"
              title="等点头"
              value={counts.pendingApprovals}
              highlight
              onClick={() => {
                onClose();
                navigate({ to: '/now' });
              }}
            />
          )}
        </div>

        {/* Thread outline — primary nav for long threads. Sheet closes
            first so the user lands on the scrolled message, not back at
            the sheet they just dismissed. */}
        {(() => {
          const intentOutlineEntries = threadOutlineFor(intent.id);
          if (intentOutlineEntries.length === 0) return null;
          return (
            <div className="px-5 pb-3">
              <details className="collapse-arrow collapse rounded-xl bg-base-200" open>
                <summary className="collapse-title flex items-center gap-3 px-4 py-3">
                  <span aria-hidden>🗺</span>
                  <span className="text-sm font-medium">大纲</span>
                  <span className="ml-auto text-xs text-base-content/55">
                    {intentOutlineEntries.length} 个节点
                  </span>
                </summary>
                <div className="collapse-content pb-2 pt-1">
                  <ThreadOutlineView
                    entries={intentOutlineEntries}
                    onJump={(messageId) => {
                      onClose();
                      window.setTimeout(() => {
                        const el = document.getElementById(`msg-${messageId}`);
                        if (!el) return;
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('ring-2', 'ring-primary', 'rounded-2xl', 'ring-offset-2');
                        window.setTimeout(() => {
                          el.classList.remove('ring-2', 'ring-primary', 'rounded-2xl', 'ring-offset-2');
                        }, 1600);
                      }, 240);
                    }}
                  />
                </div>
              </details>
            </div>
          );
        })()}

        {/* Outline */}
        {outline.length > 0 && (
          <div className="px-5 pb-3">
            <OutlineSheet outline={outline} />
          </div>
        )}

        {/* Files */}
        {files.length > 0 && (
          <div className="px-5 pb-4">
            <FilesSheet files={files} />
          </div>
        )}

        {/* Dev binding */}
        {devMode && bind && (
          <div className="border-t border-base-300/40 bg-base-200/40 px-5 py-4">
            <div className="text-[0.8125rem] uppercase tracking-wider text-base-content/45">
              🔧 底层引擎 · Engine
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bind.agentKeys.map((k) => {
                const a = findAgent(k);
                return (
                  <span key={k} className="badge badge-ghost badge-sm">
                    {a?.emoji} {a?.displayName}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-base-content/60">
              ⚡ <code className="rounded bg-base-300/60 px-1.5 py-0.5">{bind.profileKey}</code>
              <span className="ml-2">→ {profile?.primaryProvider}</span>
            </div>
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}

function SheetStat({
  icon,
  title,
  value,
  onClick,
  highlight = false,
}: {
  icon: string;
  title: string;
  value: number | string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-xl p-3 text-left transition disabled:cursor-default',
        highlight ? 'bg-warning/10 ring-1 ring-warning/30' : 'bg-base-200',
        onClick && !highlight && 'hover:bg-base-300/60',
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-xs text-base-content/65">{title}</span>
        <span className="text-base" aria-hidden>
          {icon}
        </span>
      </div>
      <div className={cn('text-2xl font-bold leading-none', highlight && 'text-warning')}>
        {value}
      </div>
    </button>
  );
}

function OutlineSheet({ outline }: { outline: OutlineNode[] }) {
  const done = outline.filter((o) => o.done).length;
  const roots = outline.filter((o) => o.parentId === null);
  const childrenOf = (id: string) => outline.filter((o) => o.parentId === id);

  return (
    <details className="collapse-arrow collapse rounded-xl bg-base-200" open>
      <summary className="collapse-title flex items-center gap-3 px-4 py-3">
        <span aria-hidden>☑</span>
        <span className="text-sm font-medium">进度</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-base-content/55">
          <progress className="progress progress-success w-16" value={done} max={outline.length} />
          {done}/{outline.length}
        </span>
      </summary>
      <div className="collapse-content">
        <ol className="space-y-1 pb-2 pt-1 text-sm">
          {roots.map((node) => (
            <li key={node.id}>
              <OutlineRow node={node} />
              {childrenOf(node.id).map((c) => (
                <div key={c.id} className="ml-7">
                  <OutlineRow node={c} small />
                </div>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function FilesSheet({ files }: { files: IntentFile[] }) {
  return (
    <details className="collapse-arrow collapse rounded-xl bg-base-200" open>
      <summary className="collapse-title flex items-center gap-3 px-4 py-3">
        <span aria-hidden>📁</span>
        <span className="text-sm font-medium">文件</span>
        <span className="ml-auto text-xs text-base-content/55">{files.length} 个</span>
      </summary>
      <div className="collapse-content">
        <ul className="grid grid-cols-1 gap-2 pb-2 pt-1">
          {files.map((f) => (
            <li key={f.id} className="card card-compact bg-base-100">
              <button type="button" className="card-body flex-row items-start gap-3 p-3 text-left">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-base-200 text-base"
                >
                  {f.kind === 'doc' ? '📄' : f.kind === 'image' ? '🖼️' : '🔗'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="truncate text-xs text-base-content/55">{f.preview}</div>
                  <div className="mt-0.5 text-[0.8125rem] text-base-content/40">
                    {timeAgo(f.updatedAt)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Desktop — two columns: conversation (main) + collapsible right rail
   ───────────────────────────────────────────────────────────────────────────
   Layout shape, mirroring IDE / docs / chat-with-context apps:

     ┌─────────────────────────────────────┬───────────────┐
     │ Slim cover-tinted header   [⏵ 详情] │               │
     ├─────────────────────────────────────┤   Right rail  │
     │                                     │   (collapse)  │
     │  Chat conversation                  │   · 计划       │
     │                                     │   · 文件       │
     │  ...                                │   · 团队       │
     │                                     │   · 记得       │
     │                                     │   · 提醒       │
     │  Sticky composer ────────────────── │   · 引擎(dev) │
     └─────────────────────────────────────┴───────────────┘

   The rail is toggleable (preference persisted via Zustand). Each rail
   section uses DaisyUI `collapse` so users can keep only what they care
   about open. Stats live in the rail header so they don't crowd the chat.
   ═══════════════════════════════════════════════════════════════════════════ */

function DesktopIntentHome({
  intent,
  msgs,
  typing,
  onSend,
  outline,
  files,
}: {
  intent: Intent;
  msgs: Message[];
  typing: boolean;
  onSend: (text: string) => void;
  outline: OutlineNode[];
  files: IntentFile[];
}) {
  const railOpen = useUI((s) => s.intentRailOpen);
  const toggleRail = useUI((s) => s.toggleIntentRail);

  return (
    <div className="h-full bg-base-100">
      <PanelGroup direction="horizontal" autoSaveId="aios-intent-v3">
        <Panel id="chat" order={1} minSize={45}>
          <div className="flex h-full flex-col">
            <SlimHeader intent={intent} railOpen={railOpen} onToggleRail={toggleRail} />
            <div className="flex-1 overflow-y-auto">
              <Conversation messages={msgs} typing={typing} />
            </div>
            <StickyComposer onSend={onSend} />
          </div>
        </Panel>
        {railOpen && (
          <>
            <PanelResizeHandle className="group w-1 bg-base-300/40 transition hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary" />
            {/*
              Rail width math (rail-window title needs: 12 px drag handle +
              28 px icon + label "助手团队" ≈ 76 px + meta "3 位" 36 px +
              two 24 px control buttons + 8 px gaps ≈ 230 px content):
                1280 px viewport → 28 % = 358 px (comfortable)
                1440 px        → 28 % = 403 px (default sweet spot)
                1920 px        → 28 % = 538 px (windows breathe)
              minSize 23 % keeps 295 px at 1280 — tight but window header
              still fits without wrapping the title row.
            */}
            <Panel
              id="rail"
              order={2}
              defaultSize={28}
              minSize={23}
              maxSize={42}
              className="overflow-hidden"
            >
              <IntentRail
                onClose={toggleRail}
                intent={intent}
                outline={outline}
                files={files}
              />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}

/* ───── Slim header (desktop) — single thin row over a soft gradient ───── */

function SlimHeader({
  intent,
  railOpen,
  onToggleRail,
}: {
  intent: Intent;
  railOpen: boolean;
  onToggleRail: () => void;
}) {
  const [reflectOpen, setReflectOpen] = useState(false);
  const navigate = useNavigate();
  // Inline title rename. Phase 1 created intents with the raw prompt as
  // the title (no LLM polish yet), so users land here with awkward
  // strings. A pencil affordance + click-to-edit makes that recoverable
  // without a separate modal — works for both signed-in real mode
  // (UPDATE intents) and signed-in mock mode (toast-only no-op).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(intent.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { update: updateIntent, isPending: renaming } = useUpdateIntent();

  const handleArchive = async () => {
    try {
      await updateIntent({ id: intent.id, archived: true });
      navigate({ to: '/' });
      toast('已封存', {
        description: '它在「封存的」里,需要的时候可以取出来',
        action: {
          label: '撤销',
          onClick: async () => {
            try {
              await updateIntent({ id: intent.id, archived: false });
              toast('取出来了');
            } catch (err) {
              toast(err instanceof Error ? err.message : '撤销失败');
            }
          },
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : '封存失败,稍后再试');
    }
  };

  // Keep the draft in sync if the underlying intent title changes from
  // elsewhere (e.g. background refetch). Only re-sync while not editing,
  // otherwise we'd clobber what the user is currently typing.
  useEffect(() => {
    if (!editing) setDraft(intent.title);
  }, [intent.title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === intent.title) {
      setDraft(intent.title);
      return;
    }
    try {
      await updateIntent({ id: intent.id, title: next });
      toast('改好了');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败,稍后再试');
      setDraft(intent.title);
    }
  };

  return (
    <header
      className="sticky top-0 z-20 overflow-hidden border-b border-base-300/40"
      style={{ background: intent.cover }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/20 to-black/30" />
      <div className="relative flex w-full items-center gap-3 px-4 py-3 text-white sm:px-6">
        <Link
          to="/"
          className="btn btn-circle btn-sm border-0 bg-black/25 text-white hover:bg-black/40"
          aria-label="回到想做的事列表"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <span className="text-2xl drop-shadow-sm" aria-hidden>
          {intent.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[0.8125rem] uppercase tracking-wider text-white/75">
              想做的事
            </span>
            {intent.lifecycle === 'pinned' && (
              <span className="badge badge-xs border-0 bg-white/25 text-white">置顶</span>
            )}
          </div>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  inputRef.current?.blur();
                } else if (e.key === 'Escape') {
                  setDraft(intent.title);
                  setEditing(false);
                }
              }}
              aria-label="改名"
              data-testid="intent-title-input"
              className="w-full truncate rounded-md bg-black/35 px-1.5 py-0.5 text-base font-semibold leading-tight text-white outline-none ring-2 ring-white/40 focus:ring-white"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="改名"
              data-testid="intent-title-button"
              className="group inline-flex max-w-full items-baseline gap-1.5 truncate text-left"
            >
              <h1 className="truncate text-base font-semibold leading-tight drop-shadow-sm">
                {intent.title}
              </h1>
              <span
                aria-hidden
                className="text-xs text-white/55 opacity-0 transition-opacity group-hover:opacity-100"
              >
                改名
              </span>
              {renaming && (
                <span className="loading loading-spinner loading-xs ml-1 text-white/70" />
              )}
            </button>
          )}
        </div>

        {/* Wrap up / 复盘 — methodology phase ⑥ */}
        <button
          type="button"
          onClick={() => setReflectOpen(true)}
          className="btn btn-sm gap-1.5 border-0 bg-black/30 text-white hover:bg-black/45"
          aria-label="复盘并完成"
          title="复盘并完成这件事"
        >
          <span aria-hidden>✓</span>
          <span className="hidden sm:inline">完成</span>
        </button>

        {/* Archive — soft delete. Lay-user copy "封存" beats "删除";
            an accidental click is recoverable via the toast's 撤销 or
            the /archive view. */}
        <div className="dropdown dropdown-end">
          <button
            type="button"
            tabIndex={0}
            data-testid="intent-actions"
            className="btn btn-sm border-0 bg-black/30 text-white hover:bg-black/45"
            aria-label="更多操作"
            title="更多"
          >
            ⋯
          </button>
          <ul
            tabIndex={0}
            className="menu dropdown-content z-50 mt-2 w-44 rounded-2xl bg-base-100 p-2 text-sm shadow-xl ring-1 ring-base-300/40"
          >
            <li>
              <button
                type="button"
                onClick={() => setEditing(true)}
                data-testid="intent-action-rename"
                className="rounded-xl"
              >
                <span aria-hidden>✏️</span> 改名
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={handleArchive}
                data-testid="intent-action-archive"
                className="rounded-xl"
              >
                <span aria-hidden>📦</span> 封存
              </button>
            </li>
          </ul>
        </div>

        {/* Detail rail toggle */}
        <label
          className="swap btn btn-sm border-0 bg-black/30 text-white hover:bg-black/45"
          aria-label="详情面板"
        >
          <input
            type="checkbox"
            checked={railOpen}
            onChange={onToggleRail}
            aria-label={railOpen ? '收起详情' : '展开详情'}
          />
          <span className="swap-on inline-flex items-center gap-1.5">
            <span aria-hidden>⏵</span>
            <span className="hidden sm:inline">详情</span>
          </span>
          <span className="swap-off inline-flex items-center gap-1.5">
            <span aria-hidden>⏴</span>
            <span className="hidden sm:inline">详情</span>
          </span>
        </label>
      </div>

      <ReflectionModal intent={intent} open={reflectOpen} onClose={() => setReflectOpen(false)} />
    </header>
  );
}

/**
 * ReflectionModal — methodology phase ⑥ (回头看 / 拐弯).
 *
 * Auto-summarizes an Intent into a 复盘卡:
 *   • Time spent (mocked from first-message timestamp)
 *   • Key decisions (pulled from ThreadOutline kind:'decision')
 *   • Outputs (Files list)
 *   • Lessons learned (mocked — Phase 6 has the LLM write these)
 *
 * "保存到记得的事" pushes a UserMemoryFact into Zustand so it surfaces on
 * /memory page as a project-category fact. Closes the loop: an Intent
 * ends → its key learning persists as cross-Intent memory.
 */
function ReflectionModal({
  intent,
  open,
  onClose,
}: {
  intent: Intent;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const addFact = useUI((s) => s.addUserMemoryFact);
  const reflection = useMemo(() => buildReflection(intent), [intent.id]);

  if (!open) return null;

  const onSave = () => {
    addFact({
      id: `umf-${Date.now()}`,
      intentId: intent.id,
      intentTitle: intent.title,
      text: `做「${intent.title}」时学到的事`,
      reflection: reflection.lessons,
      createdAt: new Date().toISOString(),
    });
    toast('已加到记得的事', { description: '这条经验以后做类似的事会自动用上' });
    onClose();
    window.setTimeout(() => navigate({ to: '/memory' }), 300);
  };

  return (
    <dialog open className="modal modal-open">
      <div className="modal-box max-w-xl">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-2xl text-2xl shadow-sm"
            style={{ background: intent.cover }}
          >
            {intent.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-base-content/45">
              复盘
            </div>
            <h3 className="truncate text-lg font-bold">{intent.title}</h3>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <ReflectStat label="时长" value={reflection.duration} />
          <ReflectStat label="决定" value={`${reflection.decisions.length} 条`} />
          <ReflectStat label="产出" value={`${reflection.outputs} 份`} />
        </div>

        {reflection.decisions.length > 0 && (
          <section className="mt-5">
            <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-base-content/45">
              关键决定
            </h4>
            <ul className="space-y-1.5 text-[14px]">
              {reflection.decisions.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-5">
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-base-content/45">
            下次类似的事,可以这样开始
          </h4>
          <ul className="space-y-2 text-[14px]">
            {reflection.lessons.map((l, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 ring-1 ring-warning/30"
              >
                <span aria-hidden>💡</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            再想想
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            保存到记得的事 →
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

function ReflectStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-base-200 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-base-content/45">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function buildReflection(intent: Intent): {
  duration: string;
  decisions: string[];
  outputs: number;
  lessons: string[];
} {
  const intentOutline = threadOutlineFor(intent.id);
  const decisions = intentOutline.filter((e) => e.kind === 'decision').map((e) => e.text);
  const files = filesFor(intent.id);
  // Mock duration: from earliest outline entry to now
  const earliest = intentOutline.length > 0 ? intentOutline[0].at : intent.lastActiveAt;
  const days = Math.max(1, Math.floor((Date.now() - new Date(earliest).getTime()) / 86400000));
  const duration = days < 1 ? '当天' : `${days} 天`;

  // Mock lessons — Phase 6 the LLM generates these from the conversation
  const lessons = lessonsFor(intent);

  return { duration, decisions, outputs: files.length, lessons };
}

function lessonsFor(intent: Intent): string[] {
  const t = intent.title.toLowerCase();
  if (t.includes('樱花') || t.includes('旅')) {
    return [
      '机票提前 6 周盯比临时买便宜近一半',
      '京都站住宿比祇园便宜 30%,步行差不多',
      '樱花季要避开周末,景点人多两倍',
    ];
  }
  if (t.includes('妈妈') || t.includes('手机') || t.includes('教')) {
    return [
      '老人手机教程用大字版 + 截图,比文字描述好太多',
      '一次只教一个功能,下次教前先复习',
      '把"不认识号码怎么办"放到最前面,这是最焦虑的点',
    ];
  }
  if (t.includes('生日') || t.includes('lisa')) {
    return [
      '提前 2 个月开始准备,选项更多预算更宽',
      'Lisa 偏好的「惊喜+她参与」组合最稳',
      '记得查 Memory 里她之前提过的愿望',
    ];
  }
  if (t.includes('日语') || t.includes('学')) {
    return [
      '每天 30 分钟比周末突击 4 小时记得牢',
      '错题本是关键,每周复习一次比新学还重要',
      '听力不要等"学好"再开始,从第一天就听',
    ];
  }
  return [
    '把目标拆到具体某天能做完的步骤,事就会推进',
    '中间遇到分叉,先记下来不要纠结,继续往前',
    '保存关键决定理由,以后回来看节省很多时间',
  ];
}

/* ───── Right rail (desktop) — independent "windows" per section ─────
 *
 * Each section is a card with its own title bar. The title bar itself is
 * a drag handle — grab and drop on another window to reorder. Title bar
 * also exposes:
 *   −    minimize (collapse body, keep title bar)
 *   ✕    dismiss (hide entirely; recover from the "+" menu in rail footer)
 *
 * Order + min/hidden state are persisted in Zustand. The whole rail can be
 * retracted via the slim-header toggle (separate `intentRailOpen` flag) or
 * resized via the PanelResizeHandle.
 */

function IntentRail({
  onClose,
  intent,
  outline,
  files,
}: {
  onClose: () => void;
  intent: Intent;
  outline: OutlineNode[];
  files: IntentFile[];
}) {
  const counts = conceptCountsFor(intent.id);
  const devMode = useUI((s) => s.devMode);
  const bind = bindingsFor(intent.id);
  const profile = bind ? hermesProfiles.find((p) => p.key === bind.profileKey) : undefined;
  const navigate = useNavigate();

  const intentFacts = memoryFacts.filter((m) => m.originIntentId === intent.id);
  const intentSchedules = scheduleEvents.filter((s) => s.intentId === intent.id);
  const intentOutline = threadOutlineFor(intent.id);

  const railOrder = useUI((s) => s.railOrder);
  const railHidden = useUI((s) => s.railHidden);
  const hideRailSection = useUI((s) => s.hideRailSection);
  const resetRail = useUI((s) => s.resetRail);

  // Conditional visibility — even if not hidden by user, sections suppress
  // themselves when there's nothing meaningful to show (engine ⇐ devMode,
  // memory/schedule ⇐ non-empty list).
  const availability: Record<RailSectionKey, boolean> = {
    thread_outline: intentOutline.length > 0,
    outline: outline.length > 0,
    files: files.length > 0,
    team: true,
    memory: intentFacts.length > 0,
    schedule: intentSchedules.length > 0,
    engine: devMode && !!bind,
  };

  const renderBody = (key: RailSectionKey) => {
    switch (key) {
      case 'thread_outline':
        return <ThreadOutlineView entries={intentOutline} />;
      case 'outline':
        return <OutlineList outline={outline} />;
      case 'files':
        return <FilesList files={files} />;
      case 'team':
        return <TeamList intentId={intent.id} />;
      case 'memory':
        return (
          <ul className="space-y-1.5">
            {intentFacts.map((f) => (
              <li
                key={f.id}
                className="rounded-lg bg-base-100 px-3 py-2 text-xs text-base-content/75 ring-1 ring-base-300/40"
              >
                {f.text}
              </li>
            ))}
          </ul>
        );
      case 'schedule':
        return (
          <ul className="space-y-1.5">
            {intentSchedules.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-2 rounded-lg bg-base-100 px-3 py-2 text-xs ring-1 ring-base-300/40"
              >
                <span aria-hidden className="mt-0.5">
                  {s.status === 'done' ? '✓' : '🔔'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-base-content/80">{s.title}</div>
                  {s.recurrence && (
                    <div className="text-[0.8125rem] text-base-content/50">
                      {s.recurrence.label}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        );
      case 'engine':
        if (!bind) return null;
        return (
          <div className="space-y-2">
            <div>
              <div className="text-[0.75rem] uppercase tracking-wider text-base-content/45">
                🦞 OpenClaw
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {bind.agentKeys.map((k) => {
                  const a = findAgent(k);
                  return (
                    <span key={k} className="badge badge-ghost badge-sm">
                      {a?.emoji} {a?.displayName}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[0.75rem] uppercase tracking-wider text-base-content/45">
                ⚡ Hermes
              </div>
              <div className="mt-1 text-xs">
                <code className="rounded bg-base-300/60 px-1.5 py-0.5">{bind.profileKey}</code>
                <span className="ml-2 text-base-content/55">→ {profile?.primaryProvider}</span>
              </div>
            </div>
            <Link to="/settings/engines" className="link link-primary text-xs">
              在「底层引擎」页改 →
            </Link>
          </div>
        );
    }
  };

  const sectionMeta = (key: RailSectionKey) => {
    switch (key) {
      case 'thread_outline':
        return { icon: '🗺', title: '大纲', meta: `${intentOutline.length} 个节点` };
      case 'outline':
        return { icon: '☑', title: '计划', meta: `${outline.filter((o) => o.done).length}/${outline.length}` };
      case 'files':
        return { icon: '📁', title: '产出文件', meta: `${files.length} 个` };
      case 'team':
        return { icon: '🤝', title: '助手团队', meta: `${counts.agents} 位` };
      case 'memory':
        return { icon: '🧠', title: '记得的事', meta: `${intentFacts.length} 条`, onTitleClick: () => navigate({ to: '/memory' }) };
      case 'schedule':
        return { icon: '🔔', title: '提醒', meta: `${intentSchedules.length} 条`, onTitleClick: () => navigate({ to: '/schedule' }) };
      case 'engine':
        // Dev-mode only — keep English term since it's the actual API/key reference
        return { icon: '🔧', title: '底层引擎', en: 'Engine (dev)' };
    }
  };

  // Visible sections = ordered ∩ available ∩ not-user-hidden
  const visibleSections = railOrder.filter(
    (k) => availability[k] && !railHidden[k],
  );
  // Hidden sections the user can re-add — must be available but hidden
  const reAddable = ALL_RAIL_SECTIONS.filter(
    (k) => availability[k] && railHidden[k],
  );

  return (
    <aside className="flex h-full flex-col bg-base-200/30">
        <header className="flex items-center justify-between border-b border-base-300/40 bg-base-200/60 px-4 py-2.5 backdrop-blur">
          <h2 className="text-sm font-semibold">详情</h2>
          <div className="flex items-center gap-1">
            {reAddable.length > 0 && <AddSectionMenu hiddenKeys={reAddable} />}
            <button
              type="button"
              onClick={resetRail}
              className="btn btn-circle btn-ghost btn-xs"
              aria-label="重置面板"
              title="重置面板"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-circle btn-ghost btn-xs"
              aria-label="收起"
              title="收起整个面板"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto bg-base-200/40 px-3 pb-6 pt-3">
          <RailStats counts={counts} />

          {counts.pendingApprovals > 0 && (
            <button
              type="button"
              onClick={() => navigate({ to: '/now' })}
              className="alert alert-warning w-full justify-start"
            >
              <span aria-hidden>⚠️</span>
              <span className="flex-1 text-left text-xs font-medium">
                {counts.pendingApprovals} 件等你点头
              </span>
              <span>›</span>
            </button>
          )}

          {visibleSections.map((key) => {
            const m = sectionMeta(key);
            const body = renderBody(key);
            if (!body) return null;
            return (
              <RailWindow
                key={key}
                sectionKey={key}
                icon={m.icon}
                title={m.title}
                en={m.en}
                meta={m.meta}
                onTitleClick={m.onTitleClick}
                onClose={() => hideRailSection(key)}
              >
                {body}
              </RailWindow>
            );
          })}

          {visibleSections.length === 0 && (
            <div className="card bg-base-100 ring-1 ring-base-300/40">
              <div className="card-body items-center p-6 text-center">
                <div className="text-2xl">🪟</div>
                <div className="text-sm font-medium">所有面板都收起来了</div>
                <button
                  type="button"
                  onClick={resetRail}
                  className="btn btn-primary btn-sm mt-2"
                >
                  恢复默认布局
                </button>
              </div>
            </div>
          )}
        </div>
    </aside>
  );
}

/* ─── Rail "window" — single section with title bar controls ─── */

function RailWindow({
  sectionKey,
  icon,
  title,
  en,
  meta,
  onTitleClick,
  onClose,
  children,
}: {
  sectionKey: RailSectionKey;
  icon: string;
  title: string;
  /** Optional English secondary label — used only for dev/concept rows. */
  en?: string;
  meta?: string;
  onTitleClick?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const minimized = useUI((s) => s.railMinimized[sectionKey]);
  const toggleMin = useUI((s) => s.toggleRailMinimized);
  const reorder = useUI((s) => s.reorderRailSection);
  const [isDragOver, setDragOver] = useState(false);

  return (
    <section
      onDragOver={(e) => {
        const src = e.dataTransfer.types.includes('text/x-rail-section');
        if (!src) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        const source = e.dataTransfer.getData('text/x-rail-section') as RailSectionKey;
        setDragOver(false);
        if (!source || source === sectionKey) return;
        e.preventDefault();
        reorder(source, sectionKey);
      }}
      className={cn(
        'card overflow-hidden bg-base-100 shadow-lg ring-1 ring-base-content/10 transition',
        isDragOver && 'ring-2 ring-primary',
      )}
    >
      {/* Title bar — itself the drag handle. Cursor switches to grab/grabbing
          via CSS; dataTransfer carries the section key so the drop target
          can call reorderRailSection. */}
      <header
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/x-rail-section', sectionKey);
        }}
        className="flex cursor-grab items-center gap-1 border-b-2 border-base-300 bg-base-200 px-3 py-2.5 active:cursor-grabbing"
        title="拖动调整位置"
      >
        <span aria-hidden className="mr-0.5 select-none text-base-content/35">
          ⋮⋮
        </span>
        <span aria-hidden className="text-base">{icon}</span>
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="text-sm font-semibold hover:underline"
          >
            {title}
          </button>
        ) : (
          <span className="text-sm font-semibold">{title}</span>
        )}
        {en && (
          <span className="text-[0.75rem] uppercase tracking-wider text-base-content/45">
            · {en}
          </span>
        )}
        {meta && (
          <span className="ml-2 text-xs text-base-content/55">{meta}</span>
        )}
        <div className="ml-auto flex items-center">
          <WindowBtn
            label={minimized ? '展开' : '最小化'}
            onClick={() => toggleMin(sectionKey)}
            glyph={minimized ? '+' : '−'}
          />
          <WindowBtn label="关闭" onClick={onClose} glyph="✕" />
        </div>
      </header>
      {!minimized && <div className="px-3 py-3">{children}</div>}
    </section>
  );
}

function WindowBtn({
  label,
  glyph,
  onClick,
  disabled = false,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="btn btn-circle btn-ghost btn-xs text-[0.75rem] leading-none disabled:opacity-30"
    >
      {glyph}
    </button>
  );
}

function AddSectionMenu({ hiddenKeys }: { hiddenKeys: RailSectionKey[] }) {
  const show = useUI((s) => s.showRailSection);
  const label: Record<RailSectionKey, string> = {
    thread_outline: '🗺 大纲',
    outline: '☑ 计划',
    files: '📁 产出文件',
    team: '🤝 助手团队',
    memory: '🧠 记得的事',
    schedule: '🔔 提醒',
    engine: '🔧 底层引擎',
  };
  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        tabIndex={0}
        className="btn btn-circle btn-ghost btn-xs"
        aria-label="加回面板"
        title="加回面板"
      >
        +
      </button>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-30 mt-2 w-56 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300/50"
      >
        <li className="menu-title">加回这些</li>
        {hiddenKeys.map((k) => (
          <li key={k}>
            <button type="button" onClick={() => show(k)}>
              {label[k]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Rail building blocks ─── */

function RailStats({ counts }: { counts: ReturnType<typeof conceptCountsFor> }) {
  return (
    <div className="stats stats-horizontal w-full bg-base-100 shadow-sm ring-1 ring-base-300/40">
      <div className="stat px-3 py-2">
        <div className="stat-title text-[0.75rem]">进度</div>
        <div className="stat-value text-lg font-semibold">
          {counts.outlineDone}/{counts.outlineTotal}
        </div>
      </div>
      <div className="stat px-3 py-2">
        <div className="stat-title text-[0.75rem]">文件</div>
        <div className="stat-value text-lg font-semibold">{counts.files}</div>
      </div>
      <div className="stat px-3 py-2">
        <div className="stat-title text-[0.75rem]">助手</div>
        <div className="stat-value text-lg font-semibold">{counts.agents}</div>
      </div>
    </div>
  );
}

/**
 * ThreadOutlineView — bird's-eye TOC for the whole Intent thread.
 *
 * Each entry anchors to a chat message; clicking scrolls the chat to that
 * message and briefly rings it. Kinds map to icons/colors so the user can
 * skim and recognize the shape of the conversation (origin → ideas →
 * decisions → milestones → plans).
 *
 * Distinct from the per-Plan task list (`OutlineList`) — that one is
 * tactical and short-lived; this one is the durable narrative spine.
 */
function ThreadOutlineView({
  entries,
  onJump,
}: {
  entries: ThreadOutlineEntry[];
  /** Override jump behavior — e.g. mobile sheet closes itself first. */
  onJump?: (messageId: string) => void;
}) {
  const defaultJump = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-primary', 'rounded-2xl', 'ring-offset-2');
    window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-primary', 'rounded-2xl', 'ring-offset-2');
    }, 1600);
  };
  const handleJump = onJump ?? defaultJump;

  return (
    <ol className="relative space-y-2.5 pl-4">
      <span
        aria-hidden
        className="absolute bottom-1 left-[7px] top-1 w-px bg-base-300"
      />
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <button
            type="button"
            onClick={() => handleJump(e.messageId)}
            className="group flex w-full items-start gap-2 rounded-lg p-1 text-left transition hover:bg-base-200/70"
          >
            <ThreadOutlineDot kind={e.kind} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className={cn('text-[11px] font-medium uppercase tracking-wide', kindStyle(e.kind))}>
                  {kindLabel(e.kind)}
                </span>
                <span className="text-[10px] text-base-content/40">
                  {timeAgo(e.at)}
                </span>
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-base-content/85 group-hover:text-base-content">
                {e.text}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

function ThreadOutlineDot({ kind }: { kind: ThreadOutlineEntry['kind'] }) {
  const map: Record<ThreadOutlineEntry['kind'], { bg: string; glyph?: string }> = {
    origin: { bg: 'bg-primary', glyph: '✦' },
    decision: { bg: 'bg-success', glyph: '✓' },
    idea: { bg: 'bg-info', glyph: '💡' },
    milestone: { bg: 'bg-accent', glyph: '🏁' },
    plan: { bg: 'bg-secondary', glyph: '☑' },
    pinned: { bg: 'bg-warning', glyph: '📌' },
  };
  const { bg, glyph } = map[kind];
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-10 mt-0.5 grid h-4 w-4 shrink-0 -translate-x-[19px] place-items-center rounded-full text-[9px] leading-none text-primary-content ring-2 ring-base-100',
        bg,
      )}
    >
      <span>{glyph}</span>
    </span>
  );
}

function kindLabel(kind: ThreadOutlineEntry['kind']): string {
  switch (kind) {
    case 'origin':
      return '起点';
    case 'decision':
      return '决定';
    case 'idea':
      return '想法';
    case 'milestone':
      return '里程碑';
    case 'plan':
      return '新计划';
    case 'pinned':
      return '置顶';
  }
}

function kindStyle(kind: ThreadOutlineEntry['kind']): string {
  switch (kind) {
    case 'origin':
      return 'text-primary';
    case 'decision':
      return 'text-success';
    case 'idea':
      return 'text-info';
    case 'milestone':
      return 'text-accent';
    case 'plan':
      return 'text-secondary';
    case 'pinned':
      return 'text-warning';
  }
}

function OutlineList({ outline }: { outline: OutlineNode[] }) {
  const roots = outline.filter((o) => o.parentId === null);
  const childrenOf = (id: string) => outline.filter((o) => o.parentId === id);
  return (
    <ol className="space-y-1 text-sm">
      {roots.map((node) => (
        <li key={node.id}>
          <OutlineRow node={node} />
          {childrenOf(node.id).map((c) => (
            <div key={c.id} className="ml-7">
              <OutlineRow node={c} small />
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}

function FilesList({ files }: { files: IntentFile[] }) {
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.id} className="card card-compact bg-base-100 ring-1 ring-base-300/40">
          <button type="button" className="card-body flex-row items-start gap-2.5 p-2.5 text-left">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-base-200 text-sm"
            >
              {f.kind === 'doc' ? '📄' : f.kind === 'image' ? '🖼️' : '🔗'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.9rem] font-medium">{f.name}</div>
              <div className="truncate text-xs text-base-content/55">{f.preview}</div>
              <div className="mt-0.5 text-[0.8125rem] text-base-content/40">{timeAgo(f.updatedAt)}</div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TeamList({ intentId }: { intentId: string }) {
  const bind = bindingsFor(intentId);
  if (!bind) {
    return <div className="text-xs text-base-content/55">还没绑定助手。</div>;
  }
  const team = bind.agentKeys.map(findAgent).filter(Boolean);
  const activityFor = (k: string) =>
    nowActivities.find((a) => a.intentId === intentId && a.agentKey === k);

  return (
    <ul className="space-y-2">
      {team.map((a) => {
        const act = activityFor(a!.key);
        return (
          <li
            key={a!.key}
            className="flex items-start gap-2.5 rounded-lg bg-base-100 p-2.5 ring-1 ring-base-300/40"
          >
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-base-200 text-base"
            >
              {a!.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.9rem] font-medium">{a!.displayName}</span>
                {act?.kind === 'running' && (
                  <span className="badge badge-info badge-soft badge-xs">在干活</span>
                )}
                {act?.kind === 'awaiting_approval' && (
                  <span className="badge badge-warning badge-soft badge-xs">等你点头</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-base-content/60">{a!.description}</div>
              {act && (
                <div className="mt-1 text-[0.8125rem] text-base-content/55">现在:{act.summary}</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ───── OutlineItem (shared) ───── */

/**
 * OutlineRow — one item in the plan, with optional expandable execution
 * steps below. Steps surface *how* an item got (or is getting) done so
 * users aren't left with a binary "done / not done" view. Closed by
 * default for items already finished; open by default for in-progress so
 * the user immediately sees what the agents are working on.
 */
function OutlineRow({ node, small = false }: { node: OutlineNode; small?: boolean }) {
  const hasSteps = !!node.steps && node.steps.length > 0;
  const isRunning = node.steps?.some((s) => s.status === 'running');
  const [open, setOpen] = useState<boolean>(!!isRunning && hasSteps);

  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={() => hasSteps && setOpen((v) => !v)}
        disabled={!hasSteps}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition',
          hasSteps && 'hover:bg-base-200/70',
          small && 'text-[0.9rem] text-base-content/70',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
            node.done
              ? 'border-success bg-success text-success-content'
              : isRunning
                ? 'border-info bg-info/20 text-info'
                : 'border-base-300 bg-base-100',
          )}
        >
          {node.done && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-2.5 w-2.5">
              <path d="M5 12l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isRunning && !node.done && (
            <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
          )}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1',
            node.done && 'text-base-content/45 line-through decoration-base-content/30',
          )}
        >
          {node.label}
        </span>
        {hasSteps && (
          <span className="ml-1 flex shrink-0 items-center gap-1 text-[0.75rem] text-base-content/45">
            <span>{node.steps!.filter((s) => s.status === 'done').length}/{node.steps!.length}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
        )}
      </button>
      {hasSteps && open && (
        <StepList steps={node.steps!} />
      )}
    </div>
  );
}

function StepList({ steps }: { steps: OutlineStep[] }) {
  return (
    <ol className="ml-6 mt-1 border-l border-base-300/60 pl-3">
      {steps.map((s) => (
        <li key={s.id} className="relative py-1.5">
          {/* Bullet on the timeline */}
          <span
            aria-hidden
            className={cn(
              'absolute -left-[19px] top-2 grid h-3 w-3 place-items-center rounded-full ring-2 ring-base-100',
              s.status === 'done' && 'bg-success',
              s.status === 'running' && 'bg-info',
              s.status === 'error' && 'bg-error',
              s.status === 'todo' && 'border border-base-300 bg-base-100',
            )}
          >
            {s.status === 'running' && (
              <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-info-content/80" />
            )}
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-[13px]',
                s.status === 'done' && 'text-base-content/70',
                s.status === 'running' && 'font-medium text-base-content',
                s.status === 'todo' && 'text-base-content/50',
                s.status === 'error' && 'text-error',
              )}
            >
              {s.label}
            </span>
            {s.agentKey && (
              <span className="text-[11px] text-base-content/45">
                · {findAgent(s.agentKey)?.displayName ?? s.agentKey}
              </span>
            )}
          </div>
          {s.result && (
            <div className="mt-0.5 text-[12px] text-base-content/55">
              {s.result}
            </div>
          )}
          {s.at && (
            <div className="text-[11px] text-base-content/40">
              {timeAgo(s.at)}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Conversation — Claude / ChatGPT-shaped layout
   ───────────────────────────────────────────────────────────────────────────
   The previous version stacked: chat-header + chat-footer (above bubble) +
   chat-bubble + chat-footer (below bubble) for assistant messages. Four
   visually distinct rows of metadata per message made the column read like
   a spreadsheet, not a conversation.

   New shape:
     • User       — right-aligned pill bubble (single shape; time on hover
                    via tooltip, not a permanent row)
     • Assistant  — full-width prose block:
                       avatar 28 · name · ·  time           ← single header row
                       text...                              ← unboxed, prose
                       💭 我记得你提过 X · Y · Z            ← optional, one line
                       🤝 X助手 · Y助手 / 用了 P · Q        ← optional, one line
                    no enclosing bubble → reads as response, not as SMS
   ═══════════════════════════════════════════════════════════════════════════ */

function Conversation({
  messages,
  typing = false,
}: {
  messages: Message[];
  typing?: boolean;
}) {
  return (
    <div className="flex-1 bg-base-100 pb-48 pt-6 sm:pt-10">
      <div className="flex w-full flex-col gap-7 px-4 sm:px-8">
        {messages.length === 0 ? (
          <EmptyChat />
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
        {typing && <TypingIndicator />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <article className="flex gap-3" aria-label="助手正在输入">
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-base-200 text-[16px] ring-1 ring-base-300/40"
      >
        ✦
      </span>
      <div className="min-w-0 flex-1">
        <header className="mb-1.5 flex items-baseline gap-2 text-[13px]">
          <span className="font-semibold text-base-content/85">助手</span>
          <span className="text-[11px] text-base-content/40">正在想…</span>
        </header>
        <div className="inline-flex items-center gap-1 rounded-2xl bg-base-200 px-3 py-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-base-content/40 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-base-content/40 [animation-delay:140ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-base-content/40 [animation-delay:280ms]" />
        </div>
      </div>
    </article>
  );
}

function EmptyChat() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="text-5xl">👋</div>
      <div className="text-lg font-semibold">从一句话开始</div>
      <div className="max-w-md text-sm leading-relaxed text-base-content/55">
        不用想格式,告诉我你想做什么、想知道什么,我会想办法帮你。
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  if (isUser) return <UserMessage message={message} />;
  return <AssistantMessage message={message} />;
}

function UserMessage({ message }: { message: Message }) {
  const text = message.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');

  return (
    <div id={`msg-${message.id}`} className="flex flex-col items-end gap-1 scroll-mt-24 transition">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-content shadow-sm">
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
      <time className="px-1 text-[11px] text-base-content/40">
        {timeAgo(message.createdAt)}
      </time>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  const devMode = useUI((s) => s.devMode);
  const text = message.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
  const traces = message.agentTraceIds?.length ? tracesForMessage(message.id) : [];
  const usedFacts = (message.usedFactIds ?? []).map(findMemoryFact).filter(Boolean);
  const usedCaps = (message.usedCapabilityIds ?? []).map(findCapability).filter(Boolean);
  const leadAgent = traces[0] ? findAgent(traces[0].agentKey) : undefined;

  return (
    <article id={`msg-${message.id}`} className="flex gap-3 scroll-mt-24 transition">
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-base-200 text-[16px] ring-1 ring-base-300/40"
      >
        {leadAgent?.emoji ?? '✦'}
      </span>

      <div className="min-w-0 flex-1">
        {/* Header — one line, attribution + time */}
        <header className="mb-1.5 flex items-baseline gap-2 text-[13px]">
          <span className="font-semibold text-base-content/85">
            {leadAgent?.displayName ?? '助手'}
          </span>
          <time className="text-[11px] text-base-content/40">
            {timeAgo(message.createdAt)}
          </time>
        </header>

        {/* Memory annotation — subtle, one line, before the prose */}
        {usedFacts.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-base-content/55">
            <span aria-hidden>💭</span>
            <span>我记得你提过</span>
            {usedFacts.map((f, i) => (
              <span key={f!.id} className="text-base-content/75">
                {f!.text}
                {i < usedFacts.length - 1 ? ',' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Body — unboxed prose; reads as response, not as SMS */}
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-base-content/90">
          {text}
        </div>

        {/* Trace / capability strip — one consolidated row, soft */}
        {(usedCaps.length > 0 || traces.length > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {usedCaps.map((c) => (
              <span
                key={c!.id}
                className="badge badge-soft badge-secondary badge-sm gap-1 font-normal"
                title={c!.description}
              >
                <span aria-hidden>{c!.icon}</span>
                用了 {c!.label}
              </span>
            ))}
            {traces.map((t) => {
              const agent = findAgent(t.agentKey);
              return (
                <span
                  key={t.id}
                  className={cn(
                    'badge badge-sm gap-1 font-normal',
                    t.status === 'running' && 'badge-info badge-soft',
                    t.status === 'error' && 'badge-error badge-soft',
                    t.status === 'done' && 'badge-ghost',
                  )}
                  title={devMode ? `${agent?.key} @ ${agent?.clawId}` : agent?.description}
                >
                  <span aria-hidden>{agent?.emoji}</span>
                  <span>{agent?.displayName}</span>
                  <span className="opacity-50">· {t.summary}</span>
                  {devMode && agent && (
                    <span className="font-mono text-[0.65rem] opacity-60">· {agent.key}</span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   StickyComposer — used by both layouts (fixed bottom)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Hero composer — the chat input is the primary entry point of the whole
 * app, so it gets visual priority: a soft top-fade behind it (lets the
 * composer "lift off" the chat), a primary-tinted ring on focus, and a
 * larger send button that pulses while idle. Bigger placeholder, more
 * vertical breathing room, and a hint row with two assist chips below.
 */
function StickyComposer({ onSend }: { onSend?: (text: string) => void }) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (onSend) {
      onSend(text);
    } else {
      toast('已发送(Phase 6 接入 OpenClaw)', { description: text });
    }
    setDraft('');
  };

  return (
    <div className="sticky bottom-0 z-10">
      {/* Soft fade so the composer reads as raised above the chat */}
      <div className="pointer-events-none h-12 bg-gradient-to-t from-base-100 via-base-100/85 to-transparent" />

      <div className="bg-base-100 px-3 pb-4 pt-1 sm:px-8 sm:pb-5">
        <div className="mx-auto w-full max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="group relative overflow-hidden rounded-3xl bg-base-200/70 shadow-[0_8px_36px_-8px_rgba(0,0,0,0.35)] ring-1 ring-base-300/50 transition focus-within:bg-base-200 focus-within:shadow-[0_12px_48px_-10px_rgba(0,0,0,0.45)] focus-within:ring-2 focus-within:ring-primary/50"
          >
            {/* Ambient gradient stripe along the top edge — visual nucleus */}
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-60 transition-opacity group-focus-within:opacity-100" />

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="想到什么直接说就好 —— 旅行、想法、要做的事、查个东西……"
              rows={2}
              className="textarea textarea-ghost block max-h-56 min-h-[3.5rem] w-full resize-none border-none bg-transparent px-5 pb-2 pt-4 text-base leading-relaxed focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="flex items-center gap-2 px-3 pb-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-1.5"
                onClick={() => toast('附件 — Phase 6')}
                aria-label="附件"
              >
                <span aria-hidden>📎</span>
                <span className="hidden sm:inline">附件</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-1.5"
                onClick={() => toast('@提到 — Phase 6')}
              >
                <span aria-hidden>@</span>
                <span className="hidden sm:inline">叫某位助手</span>
              </button>
              <kbd className="kbd kbd-sm ml-auto hidden text-[0.7rem] opacity-60 sm:inline-flex">⌘ ↵</kbd>
              <button
                type="submit"
                disabled={!draft.trim()}
                className={cn(
                  'btn btn-primary btn-md gap-1.5 rounded-full px-5 shadow-lg',
                  !draft.trim() && 'opacity-70',
                )}
                aria-label="发送"
              >
                <span>发送</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="m5 12 7-7 7 7" />
                  <path d="M12 19V5" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function IntentHomeSkeleton() {
  return (
    <div
      data-testid="intent-skeleton"
      className="flex h-full flex-col gap-6 px-4 pt-6 sm:px-8"
    >
      <div className="h-10 w-2/3 max-w-md animate-pulse rounded-xl bg-base-200/60" />
      <div className="flex flex-col gap-3">
        <div className="h-16 w-3/4 max-w-2xl animate-pulse rounded-2xl bg-base-200/60" />
        <div className="ml-auto h-12 w-2/3 max-w-md animate-pulse rounded-2xl bg-base-200/60" />
        <div className="h-20 w-3/4 max-w-2xl animate-pulse rounded-2xl bg-base-200/60" />
      </div>
      <div className="mt-auto h-14 max-w-3xl animate-pulse rounded-2xl bg-base-200/60" />
    </div>
  );
}

function MobileTitleEdit({ intent }: { intent: Intent }) {
  // Same rename UX as desktop SlimHeader, scaled to the thinner mobile
  // header bar. Kept inline (rather than a modal) because mobile keyboards
  // still feel responsive against an inline input, and the alternative —
  // opening the info sheet to find a "rename" row — adds two extra taps
  // that lay users won't discover.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(intent.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { update: updateIntent, isPending: renaming } = useUpdateIntent();

  useEffect(() => {
    if (!editing) setDraft(intent.title);
  }, [intent.title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === intent.title) {
      setDraft(intent.title);
      return;
    }
    try {
      await updateIntent({ id: intent.id, title: next });
      toast('改好了');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败,稍后再试');
      setDraft(intent.title);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === 'Escape') {
            setDraft(intent.title);
            setEditing(false);
          }
        }}
        aria-label="改名"
        data-testid="intent-title-input-mobile"
        className="w-full truncate rounded-md bg-black/35 px-1.5 py-0.5 text-sm font-semibold leading-tight text-white outline-none ring-2 ring-white/40 focus:ring-white"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      data-testid="intent-title-button-mobile"
      aria-label="改名"
      className="block w-full truncate text-left text-sm font-semibold leading-tight text-white drop-shadow-sm"
    >
      {intent.title}
      {renaming && (
        <span className="loading loading-spinner loading-xs ml-1 align-middle text-white/70" />
      )}
    </button>
  );
}
