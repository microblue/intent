import { Link } from '@tanstack/react-router';
import { useIntents } from '@/data/useIntents';
import { useSession } from '@/lib/auth';
import { IntentCard, NewIntentCard } from '@/components/IntentCard';

/**
 * Starter templates — shown above the intent grid as inspiration. When the
 * list is empty (cold-start) they become the primary CTA; when there are
 * intents they sit above as a "what else can I do?" rail.
 *
 * Each template prefills /new with a seed sentence so the clarifying
 * interview lands on the matching keyword-route.
 */
const STARTER_TEMPLATES = [
  {
    emoji: '✈️',
    title: '计划一次旅行',
    blurb: '出发时间、几个人、预算,我帮你出路线 + 盯机票',
    seed: '帮我计划一次旅行',
    cover: 'linear-gradient(135deg, oklch(72% 0.16 220), oklch(70% 0.14 280))',
  },
  {
    emoji: '🎁',
    title: '给家人选礼物',
    blurb: '想做的事 + 预算,我帮你列方向 + 提前提醒',
    seed: '给老婆办个生日',
    cover: 'linear-gradient(135deg, oklch(78% 0.15 350), oklch(72% 0.13 290))',
  },
  {
    emoji: '📝',
    title: '整理 / 改简历',
    blurb: '说说目标方向,我帮你出框架 + 改 3 版',
    seed: '想换个新方向,简历需要重写',
    cover: 'linear-gradient(135deg, oklch(70% 0.13 260), oklch(72% 0.12 200))',
  },
  {
    emoji: '📚',
    title: '学一个新东西',
    blurb: '时间和目标定下来,我帮你拆 4 周计划',
    seed: '想学日语 N3,6 月底考',
    cover: 'linear-gradient(135deg, oklch(76% 0.13 140), oklch(72% 0.13 200))',
  },
  {
    emoji: '🍽️',
    title: '安排这周吃什么',
    blurb: '忌口和时间预算告诉我,出菜单 + 采购单',
    seed: '帮我安排这周的晚饭',
    cover: 'linear-gradient(135deg, oklch(78% 0.13 60), oklch(74% 0.12 30))',
  },
  {
    emoji: '👵',
    title: '教家人用智能手机',
    blurb: '对方水平 + 想学的功能,我做大字版图文',
    seed: '教妈妈用智能手机',
    cover: 'linear-gradient(135deg, oklch(76% 0.14 60), oklch(70% 0.12 30))',
  },
];

export function IntentListPage() {
  const { intents: list, isLoading, error, isMock } = useIntents();
  const { user } = useSession();
  const isEmpty = !isLoading && !error && list.length === 0;
  // Friendly greeting prefers the user's chosen name / email handle but
  // falls back to a neutral "你" so anonymous demo visitors don't see a
  // stranger's name.
  const greetingName = user?.user_metadata?.full_name
    ?? user?.email?.split('@')[0]
    ?? '你';

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          下午好,{greetingName} ☀️
        </h1>
        <p className="mt-1 text-sm text-base-content/60">
          {isLoading
            ? '让我看看你正在做的事 ——'
            : error
              ? '加载的时候卡了一下,稍等再试。'
              : isEmpty
                ? '今天想做点什么?下面是一些常见的事,你可以从这儿开始 ——'
                : `你有 ${list.length} 件想做的事在跑。最近忙的是「${list[0]?.title}」。`}
        </p>
        {isMock && (
          <p className="mt-1 text-[11px] text-base-content/40">
            演示数据 · 登录后看到的是你自己的
          </p>
        )}
      </div>

      {/* Starter templates — visible always (inspiration) but emphasized
          when the user has no intents yet (cold start). */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-base-content/70">
            {isEmpty ? '从这儿开始' : '想试点别的?'}
          </h2>
          {!isEmpty && (
            <span className="text-xs text-base-content/45">点一下,我帮你拆</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STARTER_TEMPLATES.map((t) => (
            <Link
              key={t.title}
              to="/new"
              search={{ seed: t.seed }}
              className="group flex flex-col gap-2 overflow-hidden rounded-2xl bg-base-100 p-3 ring-1 ring-base-300/40 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/30"
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-xl text-2xl shadow-sm"
                style={{ background: t.cover }}
              >
                {t.emoji}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold leading-tight">
                  {t.title}
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-base-content/55">
                  {t.blurb}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl bg-base-200/60 ring-1 ring-base-300/40"
            />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-2xl border border-error/30 bg-error/5 p-6 text-sm text-error">
          <div className="font-medium">读取数据的时候出错了</div>
          <p className="mt-1 text-error/80">
            {error.message ?? '稍等一下,再刷新一次试试。'}
          </p>
        </div>
      )}

      {!isLoading && !error && list.length > 0 && (
        <>
          <div className="mb-3 text-sm font-semibold text-base-content/70">
            你正在做的事
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <NewIntentCard />
            {list.map((it) => (
              <IntentCard key={it.id} intent={it} />
            ))}
          </div>
        </>
      )}

      {isEmpty && (
        <div
          data-testid="intentlist-empty"
          className="rounded-2xl border-2 border-dashed border-base-300/60 bg-base-100/40 p-8 text-center"
        >
          <div className="text-4xl">👋</div>
          <div className="mt-3 text-base font-medium">还没有任何事在做</div>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-base-content/55">
            点上面的模板,或者直接告诉我你想做什么 ——
          </p>
          <Link
            to="/new"
            search={{ seed: undefined }}
            className="btn btn-primary btn-md mt-4 gap-2 rounded-full px-6 shadow"
          >
            <span aria-hidden>✨</span>
            起一个新意图
          </Link>
        </div>
      )}

      <div className="mt-16 rounded-2xl bg-base-200/60 p-6 text-sm text-base-content/65 ring-1 ring-base-300/40">
        <div className="mb-1.5 font-medium text-base-content/85">小贴士</div>
        随时按{' '}
        <kbd className="rounded-md bg-base-300 px-1.5 py-0.5 text-[0.8125rem] font-medium">
          ⌘ K
        </kbd>{' '}
        或者点上面的「搜一下」找东西。不会有问错的问题 —— 不知道怎么说,直接告诉我你想做什么就行。
      </div>
    </div>
  );
}
