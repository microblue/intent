import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { findIntent, type MemoryFact } from '@/mocks';
import { useMemoryFacts } from '@/data/useMemoryFacts';
import { useUI } from '@/state/ui';

const groupOrder: { key: MemoryFact['category']; label: string; emoji: string; hint: string }[] = [
  { key: 'about-you', label: '关于你', emoji: '🧍', hint: '基础情况 + 习惯' },
  { key: 'preferences', label: '你的偏好', emoji: '💫', hint: '挑选东西时会用上' },
  { key: 'people', label: '重要的人', emoji: '💞', hint: '提醒、礼物、联络时会用上' },
  { key: 'project', label: '项目相关', emoji: '🎯', hint: '每件事的预算 / 目标' },
];

export function MemoryPage() {
  const { facts, byCategory: groups, isLoading, error } = useMemoryFacts();
  const userFacts = useUI((s) => s.userMemoryFacts);
  const removeUserFact = useUI((s) => s.removeUserMemoryFact);
  const total = facts.length + userFacts.length;
  const isEmpty = !isLoading && !error && total === 0;

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader
        emoji="🧠"
        title="助手记得你的事"
        term="memory"
        subtitle={
          isEmpty
            ? '助手还没有记下任何事 —— 跟我聊起来,我会顺手把重要的事写下来。'
            : `我记得你的 ${total} 件事 — 看到不该记的,点 ✕ 让我忘掉。`
        }
      />

      <div className="mb-6 rounded-2xl bg-info/10 p-4 text-sm leading-relaxed text-info-content/85 ring-1 ring-info/30">
        <div className="mb-1 font-medium text-info">关于记忆</div>
        我只在你跟我聊天的时候,顺手把重要的事写下来。这些是<strong>跨项目</strong>都能用的 ——
        比如你在「樱花旅行」告诉我你喜欢早班机,以后帮你订其他行程时我也会记得。
      </div>

      {isEmpty && (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-base-300/60 bg-base-100/40 p-8 text-center">
          <div className="text-4xl">🧠</div>
          <div className="mt-3 text-base font-medium">还没记下任何事</div>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-base-content/55">
            举几个例子,助手会自动记下来的事:<br />
            <span className="text-base-content/70">「老婆 Lisa,生日 7/8」</span> ·{' '}
            <span className="text-base-content/70">「不爱吃太辣」</span> ·{' '}
            <span className="text-base-content/70">「喜欢早班机」</span>
          </p>
          <p className="mx-auto mt-3 max-w-md text-xs text-base-content/45">
            起一个新意图,开始聊天,这一页就会自然长出东西。
          </p>
        </div>
      )}

      {!isEmpty && groupOrder.map((g) => (
        <section key={g.key} className="mb-7">
          <header className="mb-3 flex items-baseline gap-3 px-1">
            <h2 className="text-base font-semibold">
              <span aria-hidden className="mr-1.5">
                {g.emoji}
              </span>
              {g.label}
            </h2>
            <span className="text-xs text-base-content/45">{g.hint}</span>
          </header>
          <ul className="flex flex-col gap-1.5">
            {groups[g.key].map((f) => (
              <FactRow key={f.id} fact={f} />
            ))}
            {groups[g.key].length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-base-content/45">
                这一类还没有东西。聊着聊着会有的。
              </li>
            )}
          </ul>
        </section>
      ))}

      {userFacts.length > 0 && (
        <section className="mb-7">
          <header className="mb-3 flex items-baseline gap-3 px-1">
            <h2 className="text-base font-semibold">
              <span aria-hidden className="mr-1.5">💡</span>
              从复盘学到的
            </h2>
            <span className="text-xs text-base-content/45">完成过的事留下的经验</span>
          </header>
          <ul className="flex flex-col gap-2">
            {userFacts.map((f) => {
              const origin = findIntent(f.intentId);
              return (
                <li
                  key={f.id}
                  className="group rounded-2xl bg-warning/10 p-3.5 ring-1 ring-warning/30 transition hover:bg-warning/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{f.text}</div>
                      {origin && (
                        <div className="mt-1 text-xs text-base-content/45">
                          来自{' '}
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                            style={{ background: origin.cover, color: 'rgba(0,0,0,0.7)' }}
                          >
                            <span>{origin.emoji}</span>
                            {origin.title}
                          </span>
                        </div>
                      )}
                      {f.reflection && f.reflection.length > 0 && (
                        <ul className="mt-2 space-y-1 text-[13px] text-base-content/75">
                          {f.reflection.map((r, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span aria-hidden className="mt-1 text-warning">•</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeUserFact(f.id);
                        toast('已忘掉这条经验');
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-base-content/45 transition hover:bg-base-300 hover:text-error sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="忘掉这条"
                      title="忘掉这条"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function FactRow({ fact }: { fact: MemoryFact }) {
  const origin = fact.originIntentId ? findIntent(fact.originIntentId) : undefined;
  return (
    <li className="group flex items-start gap-3 rounded-2xl bg-base-200/60 p-3.5 ring-1 ring-base-300/40 transition hover:bg-base-200">
      <div className="flex-1">
        <div className="text-sm leading-relaxed">{fact.text}</div>
        {origin && (
          <div className="mt-1 text-xs text-base-content/45">
            来自{' '}
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
              style={{ background: origin.cover, color: 'rgba(0,0,0,0.7)' }}
            >
              <span>{origin.emoji}</span>
              {origin.title}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => toast('我会忘掉这件事(Phase 6 真删除)', { description: fact.text })}
        className="rounded-lg p-1.5 text-base-content/45 transition hover:bg-base-300 hover:text-error sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="忘掉这件事"
        title="忘掉这件事"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
