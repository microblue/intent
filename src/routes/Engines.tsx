import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import {
  agents,
  hermesProfiles,
  intentBindings,
  intents,
  findAgent,
  type Agent,
} from '@/mocks';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { throwTestError } from '@/lib/sentry';

export function EnginesPage() {
  const clawes = Array.from(new Set(agents.filter((a) => a.source === 'openclaw').map((a) => a.clawId!)));
  const openclawByClaw: Record<string, Agent[]> = {};
  for (const c of clawes) openclawByClaw[c] = agents.filter((a) => a.source === 'openclaw' && a.clawId === c);

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader
        emoji="🔧"
        title="底层引擎"
        term="engine"
        subtitle="开发者模式专属。这一页展示 AIOS 背后真实跑的东西:数据归属、助手在哪个 claw、走哪条 provider。"
      />

      {/* 4-plane summary */}
      <section className="mb-10">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">
          架构 — 4 个平面
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <PlaneCard
            tone="supabase"
            title="Identity & Registry"
            subtitle="Supabase"
            status="connected"
            items={[
              'Auth (email + OAuth)',
              'Postgres + RLS',
              'Edge: mint_claw_token',
              'Realtime claw 状态',
            ]}
            owns="账号 / 订阅 / Intent metadata / 偏好 / 设备"
          />
          <PlaneCard
            tone="api"
            title="Server-side writes"
            subtitle="apps/api · Hono + service-role"
            status="connected"
            items={['register_claw', 'claim_claw', 'Polar webhooks', '邮件 / 管理动作']}
            owns="需要 service-role 的写操作"
          />
          <PlaneCard
            tone="openclaw"
            title="Agent Runtime"
            subtitle="OpenClaw · per-claw"
            status="connected"
            items={['47 agents × N claws', 'Skills / Tools', '本地消息历史', 'Job state']}
            owns="Agent 实际执行 / 消息 / Trace"
          />
          <PlaneCard
            tone="hermes"
            title="LLM Gateway"
            subtitle="Hermes · profiles"
            status="connected"
            items={['Provider 路由', '速率 / 配额', '允许列表 / 工具', 'Per-profile env']}
            owns="LLM 调用本身"
          />
        </div>
      </section>

      {/* Hermes profiles */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">
          <span>助手通道</span>
          <span className="font-normal opacity-60">· Hermes profiles</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {hermesProfiles.map((p) => (
            <article
              key={p.key}
              className="rounded-2xl bg-base-200/60 p-4 ring-1 ring-base-300/40"
            >
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  <span aria-hidden className="mr-1.5">⚡</span>
                  {p.displayName}
                </h3>
                <code className="text-[0.8125rem] text-base-content/45">{p.key}</code>
              </header>
              <p className="mt-1 text-xs text-base-content/65">{p.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="rounded-full bg-base-300/60 px-2 py-0.5 text-base-content/65">
                  primary: {p.primaryProvider}
                </span>
                <span className="inline-flex items-center gap-1 text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> 在线
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* OpenClaw clawes + agents */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">
          <span>各 claw 上的助手</span>
          <span className="font-normal opacity-60">· OpenClaw Agents</span>
        </h2>
        {Object.entries(openclawByClaw).map(([claw, list]) => (
          <article key={claw} className="mb-4 rounded-2xl bg-base-200/60 p-4 ring-1 ring-base-300/40">
            <header className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                <span aria-hidden className="mr-1.5">🦞</span>
                {claw}
              </h3>
              <span className="text-xs text-base-content/55">
                {list.length} / 47 个助手 · Agents
              </span>
            </header>
            <ul className="mt-3 flex flex-wrap gap-2">
              {list.map((a) => (
                <li
                  key={a.key}
                  className="rounded-full bg-base-100 px-3 py-1 text-xs text-base-content/75 ring-1 ring-base-300/60"
                  title={a.description}
                >
                  <span className="font-medium">{a.displayName}</span>
                  <code className="ml-1.5 text-[0.8125rem] text-base-content/45">{a.key}</code>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {/* Per-intent bindings */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">
          <span>每个项目的引擎绑定</span>
          <span className="font-normal opacity-60">· Intent → Agents + Profile</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {intents.map((it) => {
            const bind = intentBindings[it.id];
            const profile = hermesProfiles.find((p) => p.key === bind?.profileKey);
            return (
              <li key={it.id}>
                <article className="rounded-2xl bg-base-200/60 p-4 ring-1 ring-base-300/40">
                  <header className="flex items-center gap-3">
                    <Link
                      to="/intent/$intentId"
                      params={{ intentId: it.id }}
                      search={{ kickoff: undefined }}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <span
                        className="grid h-7 w-7 place-items-center rounded-lg text-base shadow-sm"
                        style={{ background: it.cover }}
                      >
                        {it.emoji}
                      </span>
                      <span className="text-sm font-medium">{it.title}</span>
                    </Link>
                    <span className="ml-auto text-[0.8125rem] text-base-content/45">
                      <code>{it.id}</code>
                    </span>
                  </header>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr]">
                    <div>
                      <div className="text-[0.8125rem] uppercase tracking-wide text-base-content/45">
                        🦞 助手 · OpenClaw Agents
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {bind?.agentKeys.map((k) => {
                          const a = findAgent(k);
                          return (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 rounded-full bg-base-100 px-2 py-0.5 text-xs ring-1 ring-base-300/60"
                              title={a?.description}
                            >
                              {a?.displayName ?? k}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div aria-hidden className="hidden self-center text-base-content/30 md:block">
                      via
                    </div>
                    <div>
                      <div className="text-[0.8125rem] uppercase tracking-wide text-base-content/45">
                        ⚡ 助手通道 · Hermes Profile
                      </div>
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-2 py-0.5 text-xs ring-1 ring-base-300/60">
                          {profile?.displayName ?? bind?.profileKey}
                          <span className="text-base-content/45">·</span>
                          <span className="text-base-content/55">{profile?.primaryProvider}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        toast('引擎切换 — 多 agent 编排正在开发', {
                          description: `把 ${it.title} 切到不同 agent 或 profile`,
                        })
                      }
                      className="rounded-full bg-base-300/70 px-3 py-1 text-xs text-base-content/65 hover:bg-base-300"
                    >
                      改绑定
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-6 text-xs text-base-content/45">
        提示:这一页只对开发者可见 —— lay-user 看到的是 Intent home / 提醒 / 助手能做什么 这些封装后的入口。
      </p>

      {env.isDev && (
        <section className="mt-6 rounded-2xl bg-base-200/60 p-4 ring-1 ring-base-300/40">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/45">
            Sentry · dev tools
          </h2>
          <p className="mb-3 text-xs text-base-content/55">
            点一下抛个错。本地 dev 只会在 console 报红;生产构建会上送到 Sentry
            (前提是 <code className="font-mono">VITE_SENTRY_DSN</code> 已设)。
          </p>
          <button
            type="button"
            data-testid="sentry-test-throw"
            onClick={throwTestError}
            className="rounded-full bg-error/20 px-3 py-1 text-xs text-error-content hover:bg-error/30"
          >
            🧨 抛一个测试错
          </button>
        </section>
      )}
    </div>
  );
}

function PlaneCard({
  tone,
  title,
  subtitle,
  items,
  owns,
  status,
}: {
  tone: 'supabase' | 'api' | 'openclaw' | 'hermes';
  title: string;
  subtitle: string;
  items: string[];
  owns: string;
  status: 'connected' | 'pending';
}) {
  const toneAccent = {
    supabase: 'from-success/40 to-success/0',
    api: 'from-info/40 to-info/0',
    openclaw: 'from-primary/40 to-primary/0',
    hermes: 'from-warning/40 to-warning/0',
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-2xl bg-base-200/60 p-4 ring-1 ring-base-300/40">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b', toneAccent)} />
      <header className="relative">
        <div className="text-[0.8125rem] uppercase tracking-wide text-base-content/45">{subtitle}</div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </header>
      <ul className="relative mt-2.5 space-y-1 text-[0.875rem] text-base-content/70">
        {items.map((i) => (
          <li key={i} className="truncate">• {i}</li>
        ))}
      </ul>
      <div className="relative mt-3 border-t border-base-300/40 pt-2.5 text-xs text-base-content/55">
        持有:{owns}
      </div>
      <div className="relative mt-2 flex items-center gap-1.5 text-xs">
        <span className={cn('h-1.5 w-1.5 rounded-full', status === 'connected' ? 'bg-success' : 'bg-base-300')} />
        <span className="text-base-content/55">{status === 'connected' ? '已连通(mock)' : '待连'}</span>
      </div>
    </article>
  );
}
