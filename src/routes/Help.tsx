import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { TERMS, type TermKey } from '@/lib/terms';

// Order matters — this is the reading order users see when they first land
// on the page. Group: workspace primitives → people/actors → cross-cutting
// → infra. Keep it short enough to read in under a minute.
const ORDER: TermKey[] = [
  'intent',
  'agent',
  'step',
  'capability',
  'memory',
  'schedule',
  'approval',
  'file',
  'outline',
  'activity',
  'engine',
];

export function HelpPage() {
  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader
        emoji="📖"
        title="帮助"
        subtitle="读一分钟就懂 MyClaw 是怎么运转的。每个概念有个中文名(平时 UI 都这么叫)和一个英文名(英文文档、开发者模式、跟工程师交流时用)。"
      />

      <div className="mb-8 rounded-2xl bg-info/10 p-4 text-sm leading-relaxed text-info-content/85 ring-1 ring-info/30">
        <div className="mb-1 font-medium text-info">为什么有这一页</div>
        MyClaw 跟普通 AI 聊天工具不一样的地方在于 ——
        我们把「事情」拆成了几个有名字的部件,各自有归属。
        看这页一遍,以后你跟我说「那个等点头的事」「记得的事忘掉一条」「这个项目里加一个助手」,我都能听懂。
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ORDER.map((k) => (
          <ConceptCard key={k} k={k} />
        ))}
      </div>

      <footer className="mt-10 rounded-2xl bg-base-200/50 p-5 text-sm text-base-content/65 ring-1 ring-base-300/40">
        <div className="mb-1.5 font-medium text-base-content/85">想看底层?</div>
        打开{' '}
        <Link to="/settings" className="text-primary hover:underline">
          设置 → 开发者模式
        </Link>
        ,之后从账号菜单进「底层引擎 · Engine」就能看到每个项目跑在哪些 OpenClaw 助手上、走哪条 Hermes 通道。
      </footer>
    </div>
  );
}

function ConceptCard({ k }: { k: TermKey }) {
  const t = TERMS[k];
  return (
    <article className="flex flex-col rounded-2xl bg-base-200/60 p-5 ring-1 ring-base-300/40">
      <header className="flex items-baseline gap-3">
        <span aria-hidden className="text-3xl leading-none">
          {t.emoji}
        </span>
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold">{t.zh}</h3>
            <span className="text-xs font-mono uppercase tracking-wider text-base-content/45">
              · {t.en}
            </span>
          </div>
        </div>
      </header>

      <p className="mt-2.5 text-sm leading-relaxed text-base-content/75">{t.definition}</p>

      <div className="mt-4">
        <div className="mb-1.5 text-[0.8125rem] font-semibold uppercase tracking-wider text-base-content/45">
          在哪能看到
        </div>
        <ul className="space-y-0.5 text-[0.875rem] text-base-content/65">
          {t.shownIn.map((spot) => (
            <li key={spot} className="flex items-start gap-1.5">
              <span aria-hidden className="mt-1 text-base-content/30">·</span>
              <span>{spot}</span>
            </li>
          ))}
        </ul>
      </div>

      {t.to && (
        <Link
          to={t.to}
          className="mt-4 inline-flex items-center gap-1 self-start rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/25"
        >
          去看一眼 →
        </Link>
      )}
    </article>
  );
}
