import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch, Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useCreateIntent } from '@/data/useCreateIntent';
import { findBuiltinAgent, recommendAgentTeam } from '@/lib/agents';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useSession } from '@/lib/auth';
import { cn } from '@/lib/cn';

/*
 * /new — phase ① "说想做什么" + phase ② "拆开看看".
 *
 * Flow:
 *   1. prompt       user types their wish
 *   2. clarifying   3-question interview, one Q at a time, chips + free text
 *   3. preview      show proposed plan + agent team, user confirms/edits
 *   4. spawning     short transitional state → navigates to Intent home
 *
 * Methodology rationale: without the clarifying step, the system has to
 * guess what the user meant. 3 well-chosen questions resolve ~80% of the
 * ambiguity in the most common consumer intents (travel / writing /
 * learning / family / generic) at the cost of ~20 seconds of user time.
 *
 * Phase 1 mock: keyword classifier + hardcoded question templates per
 * category. Phase 6 swaps in a real "intent inferencer" agent on OpenClaw
 * that drafts questions dynamically.
 */

type Stage = 'prompt' | 'clarifying' | 'preview' | 'spawning';

type ClarifyQuestion = {
  id: string;
  text: string;
  options: string[];
};

type AgentChip = { emoji: string; name: string };

type Proposal = {
  emoji: string;
  title: string;
  cover: string;
  /** Short intro the assistant says once before asking the first question. */
  intro: string;
  questions: ClarifyQuestion[];
  /** Plan preview shown after clarifying — 3-5 short bullets. */
  planPreview: string[];
  agents: AgentChip[];
  /** Where to land after spawn (mock — Phase 6 creates real id). */
  landIntentId: string;
};

/* ───── Mock proposal templates ───── */

/**
 * Rule-based title extraction for the generic fallback path.
 *
 * Lay users phrase wishes as polite requests: "帮我准备一次东京樱花
 * 季旅行 4 月初出发" — stuffing that as a literal intent title makes
 * the card unreadable. We strip leading polite/imperative prefixes
 * and trailing helper clauses, then truncate to a card-friendly
 * length. Phase 1 quality bar: the result should look like something
 * a person would actually call their project, not a raw sentence.
 *
 * This is a placeholder until we have a real intent-summariser agent
 * doing this server-side. Once that's in place, this function becomes
 * the offline-mode / pre-network fallback.
 */
export function extractTitle(raw: string): string {
  let s = raw.trim();
  if (!s) return '新事情';

  // Strip leading polite / imperative prefixes. Order matters: longest
  // patterns first so they don't get partially consumed.
  const POLITE_PREFIXES = [
    /^麻烦(你|您)?(帮|替)我/,
    /^可以(帮|替|麻烦|让)我/,
    /^请(你|您)?(帮|替)?我/,
    /^我(想|要|想要|希望|打算|准备|计划)(去|要|做|开始)?/,
    /^(帮|替|给|让|为)我/,
    /^我(觉得)?需要/,
    /^请(求|你)?(帮忙)?/,
    /^你(能不能|可不可以|能否)/,
    /^能否(帮我)?/,
  ];
  for (let i = 0; i < 3; i++) {
    const before = s;
    for (const re of POLITE_PREFIXES) s = s.replace(re, '').trimStart();
    if (s === before) break;
  }

  // Trim trailing helper clauses that explain timing / preferences but
  // aren't part of the noun the project is "about". Keep the comma-
  // separated head; the rest belongs in the chat thread, not the title.
  const FIRST_CLAUSE = /^([^,，。!?！？\n]+)/;
  const m = s.match(FIRST_CLAUSE);
  if (m && m[1]) s = m[1];

  // Drop a hanging "一下" / "下" at the tail that adds no signal.
  s = s.replace(/(一下|一次|下)$/, '').trim();

  // Card budget: ~16 CJK chars renders cleanly without truncation
  // ellipsis at the default card width. Longer strings get cut here;
  // the chat thread retains the full prompt as the first message.
  if (s.length > 16) s = s.slice(0, 16).trim();

  return s || '新事情';
}

function proposeIntent(text: string): Proposal {
  const t = text.toLowerCase();

  if (t.includes('生日') || t.includes('birthday')) {
    return {
      emoji: '💝',
      title: '老婆 Lisa 的生日',
      cover: 'linear-gradient(135deg, oklch(78% 0.15 350), oklch(72% 0.13 290))',
      intro: '好嘞 💝 离 7/8 还有大概 2 个月,提前准备最舒服。先问你几件小事,让我能帮你想得更准 ——',
      questions: [
        {
          id: 'q1',
          text: '想给她惊喜,还是和她一起商量?',
          options: ['想给她惊喜', '一起商量更好', '半惊喜 — 礼物保密但出门由她挑'],
        },
        {
          id: 'q2',
          text: '心里预算大概多少?',
          options: ['¥1,000 上下', '¥3,000–5,000', '不设限,合适最重要'],
        },
        {
          id: 'q3',
          text: '她最近提过什么想要 / 想去的事?',
          options: ['没特别提过', '提过想看演唱会', '说想去日本看樱花', '想换个新包'],
        },
      ],
      planPreview: [
        '查 Lisa 提过的偏好(看看 Memory)',
        '出 3 个方向 —— 礼物 / 一次出游 / 一顿仪式感晚饭',
        '6/20 前定下来,留够时间',
        '7/8 当天提醒你',
      ],
      agents: [
        { emoji: '🤝', name: '规划员' },
        { emoji: '🎁', name: '比价员' },
        { emoji: '🧠', name: '记得员' },
      ],
      landIntentId: 'birthday',
    };
  }

  if (t.includes('旅行') || t.includes('旅游') || t.includes('出国') || t.includes('飞') || t.includes('日本') || t.includes('樱花')) {
    return {
      emoji: '✈️',
      title: '新的旅行',
      cover: 'linear-gradient(135deg, oklch(72% 0.16 220), oklch(70% 0.14 280))',
      intro: '好的 ✈️ 帮你规划一次旅行。先聊几件事,我边问边记 ——',
      questions: [
        {
          id: 'q1',
          text: '大概什么时候出发,几天?',
          options: ['这个月内,3-4 天', '下个月,1 周', '不急,2-3 个月后,1-2 周'],
        },
        {
          id: 'q2',
          text: '想去哪儿,或者偏好哪种?',
          options: ['国内,不冷不热', '日本看樱花', '东南亚海岛', '欧洲文化'],
        },
        {
          id: 'q3',
          text: '几个人,大概预算?',
          options: ['一个人,¥3,000–5,000', '夫妻俩,¥10,000–20,000', '一家三口,不设限'],
        },
      ],
      planPreview: [
        '出 2-3 个候选路线 + 时间建议',
        '盯机票价格,触发阈值时提醒',
        '帮你比价住宿,挑 5 家候选',
        '出每日行程草稿,出发前一周定版',
      ],
      agents: [
        { emoji: '🗺', name: '差旅员' },
        { emoji: '🔍', name: '研究员' },
        { emoji: '💰', name: '比价员' },
      ],
      landIntentId: 'sakura',
    };
  }

  if (t.includes('学') || t.includes('考')) {
    return {
      emoji: '🎓',
      title: '学新东西',
      cover: 'linear-gradient(135deg, oklch(76% 0.13 140), oklch(72% 0.13 200))',
      intro: '好 🎓 学东西最关键是节奏。问你三件事 ——',
      questions: [
        {
          id: 'q1',
          text: '想学什么,到什么程度?',
          options: ['日语 N3,能日常对话', 'Python 入门,能写小工具', '想读一本经典书'],
        },
        {
          id: 'q2',
          text: '每天大概能挤多少时间?',
          options: ['15-20 分钟,通勤路上', '30-45 分钟,睡前', '1 小时以上,周末整块'],
        },
        {
          id: 'q3',
          text: '有截止时间吗?',
          options: ['有,6 月底前', '没有,稳着来', '想速成,2 周内见效'],
        },
      ],
      planPreview: [
        '按你的时间长度拆 4 周计划',
        '每天清单 + 自动提醒',
        '错题/难点自动记下来定期复习',
        '每周末小测,卡住就调整节奏',
      ],
      agents: [
        { emoji: '🎓', name: '导学员' },
        { emoji: '🧠', name: '记得员' },
        { emoji: '🔔', name: '日程员' },
      ],
      landIntentId: 'japanese',
    };
  }

  if (t.includes('简历') || t.includes('工作') || t.includes('面试') || t.includes('求职')) {
    return {
      emoji: '💼',
      title: '工作的事',
      cover: 'linear-gradient(135deg, oklch(70% 0.13 260), oklch(72% 0.12 200))',
      intro: '好 💼 来理一理。先告诉我三件事 ——',
      questions: [
        {
          id: 'q1',
          text: '想做的是?',
          options: ['找新工作', '改简历', '准备下次面试', '想想方向'],
        },
        {
          id: 'q2',
          text: '现在在哪个方向,想去哪个方向?',
          options: ['同方向跳,要更资深', '想转 AI infra', '想从前端转后端', '不确定,先聊聊'],
        },
        {
          id: 'q3',
          text: '时间紧不紧?',
          options: ['不急,3 个月内出结果', '下个月有面试', '本周内要交简历'],
        },
      ],
      planPreview: [
        '出简历 / 自我介绍框架,改 3 版',
        '罗列目标公司 + 面试题库',
        '安排模拟面试 + 复盘',
        '每周一份进展小结',
      ],
      agents: [
        { emoji: '✍', name: '写手' },
        { emoji: '🔍', name: '研究员' },
        { emoji: '🤝', name: '规划员' },
      ],
      landIntentId: 'job',
    };
  }

  if (t.includes('教') || t.includes('妈妈') || t.includes('爸爸') || t.includes('爷爷') || t.includes('奶奶')) {
    return {
      emoji: '👵',
      title: '教家人用东西',
      cover: 'linear-gradient(135deg, oklch(76% 0.14 60), oklch(70% 0.12 30))',
      intro: '好 👵 帮长辈学新东西要特别用心。先问几件事 ——',
      questions: [
        {
          id: 'q1',
          text: '对方现在的状况是?',
          options: ['完全新手', '会一点,常卡', '会用,但记不住步骤'],
        },
        {
          id: 'q2',
          text: '最想先学会哪个功能?',
          options: ['微信视频', '微信支付', '看抖音 / 视频', '相册 & 备份照片'],
        },
        {
          id: 'q3',
          text: '怎么把材料给对方?',
          options: ['打印大字版教程', '微信发图文', '面对面教,我做演示'],
        },
      ],
      planPreview: [
        '按对方水平挑 4 个最常用功能',
        '每个功能出大字版图文教程',
        '汇总成一份 PDF / 实体打印',
        '约时间面对面过一遍',
      ],
      agents: [
        { emoji: '✍', name: '写手' },
        { emoji: '🔍', name: '研究员' },
        { emoji: '🎨', name: '排版员' },
      ],
      landIntentId: 'mom-phone',
    };
  }

  if (t.includes('做饭') || t.includes('吃') || t.includes('晚饭') || t.includes('菜单')) {
    return {
      emoji: '🍳',
      title: '吃饭的事',
      cover: 'linear-gradient(135deg, oklch(76% 0.13 140), oklch(72% 0.13 200))',
      intro: '好 🍳 帮你想吃的。先问三件事 ——',
      questions: [
        {
          id: 'q1',
          text: '是一次的事,还是常规安排?',
          options: ['这周一次', '每周晚饭', '每天三餐'],
        },
        {
          id: 'q2',
          text: '有忌口或偏好吗?',
          options: ['不爱吃太辣', '少油少盐', '想多吃点蛋白', '没忌口'],
        },
        {
          id: 'q3',
          text: '做饭时间多久?',
          options: ['30 分钟内搞定', '1 小时左右', '周末有空,精致一点'],
        },
      ],
      planPreview: [
        '出一周菜单(早/晚)',
        '生成采购清单,标量',
        '复杂菜配视频或步骤图',
        '周日提醒采购',
      ],
      agents: [
        { emoji: '🥢', name: '家厨员' },
        { emoji: '🛒', name: '采购员' },
        { emoji: '🔔', name: '日程员' },
      ],
      landIntentId: 'dinner',
    };
  }

  // Generic fallback
  return {
    emoji: '✨',
    title: extractTitle(text),
    cover: 'linear-gradient(135deg, oklch(72% 0.16 290), oklch(70% 0.13 200))',
    intro: '收到。我想先问你三件事,这样能帮得更准 ——',
    questions: [
      {
        id: 'q1',
        text: '什么时候要有结果?',
        options: ['今天 / 这周内', '这个月内', '不急,有就好'],
      },
      {
        id: 'q2',
        text: '完成的样子是什么?',
        options: ['一份文档', '一个安排好的事', '一个决定'],
      },
      {
        id: 'q3',
        text: '只有你,还是有别人涉及?',
        options: ['只是我自己', '我和家人 / 伴侣', '工作上的事,有同事'],
      },
    ],
    planPreview: [
      '先把这件事拆成 2-3 步',
      '需要的话拉人手帮忙',
      '完成后沉淀文件 + 记下教训',
    ],
    agents: [{ emoji: '🤝', name: '规划员' }],
    landIntentId: 'birthday',
  };
}

const STARTER_CHIPS = [
  { icon: '✈️', text: '帮我规划一次旅行' },
  { icon: '💝', text: '给老婆办个生日' },
  { icon: '🎓', text: '想学个新东西' },
  { icon: '👵', text: '教妈妈用智能手机' },
  { icon: '💼', text: '为面试做点准备' },
];

/* ───── Page ───── */

export function NewIntentPage() {
  const search = useSearch({ strict: false }) as { seed?: string };
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('prompt');
  const [prompt, setPrompt] = useState(search.seed ?? '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const proposal = useMemo(() => (prompt ? proposeIntent(prompt) : null), [prompt]);

  // Recommended team from prompt keywords. Always at least [main],
  // plus up to 2 specialists matched by the lib/agents catalog.
  const recommendedTeam = useMemo(
    () => recommendAgentTeam(prompt),
    [prompt],
  );

  useEffect(() => {
    if (stage === 'prompt') inputRef.current?.focus();
  }, [stage]);

  const { create, isMock } = useCreateIntent();
  const { signedIn } = useSession();

  const goSpawn = async () => {
    if (!proposal) return;
    setStage('spawning');
    try {
      const created = await create({
        title: proposal.title,
        emoji: proposal.emoji,
      });
      // Persist the recommended team into intent_agents.
      //
      // The Supabase trigger `seed_intent_main_agent` already inserts
      // `main` on every intent INSERT, so we only push the SPECIALISTS
      // here. If the client INSERT fails for any reason (network drop,
      // bad RLS state, race), the user still has `main` from the
      // trigger + can add specialists from TeamPanel.
      //
      // Use upsert with ignoreDuplicates so partial state is OK and
      // retries are safe.
      if (env.useRealData && signedIn && recommendedTeam.length > 0) {
        const specialists = recommendedTeam.filter((id) => id !== 'main');
        if (specialists.length > 0) {
          const rows = specialists.map((agentKey) => {
            const a = findBuiltinAgent(agentKey);
            return {
              intent_id: created.id,
              agent_key: agentKey,
              display_name: a?.name ?? agentKey,
              is_orchestrator: false,
            };
          });
          const { error } = await supabase
            .from('intent_agents')
            .upsert(rows, { onConflict: 'intent_id,agent_key', ignoreDuplicates: true });
          if (error) {
            console.warn('[new] specialist team seed failed:', error.message);
            toast(`助手团队推荐没保存上(${error.message})。可在意图详情里手动加。`);
          }
        }
      }
      navigate({ to: '/intent/$intentId', params: { intentId: created.id } });
    } catch (err) {
      // Mock mode rejection lands here too — show the friendly copy from
      // useCreateIntent + drop back to the preview so the user can adjust
      // or sign in. Production-mode errors (RLS, network) get the same
      // pattern.
      const message =
        err instanceof Error ? err.message : '保存的时候卡了一下,再试试?';
      toast(message);
      // The "navigate to the keyword-route mock" was the Phase-1 demo
      // fallback. Preserve it only when we explicitly know this is mock
      // mode AND the proposal points at a known mock id — otherwise stay
      // put so the user understands nothing got saved.
      if (isMock && proposal.landIntentId) {
        navigate({
          to: '/intent/$intentId',
          params: { intentId: proposal.landIntentId },
        });
      } else {
        setStage('preview');
      }
    }
  };

  const restart = () => {
    setAnswers({});
    setCurrentQ(0);
    setStage('prompt');
  };

  return (
    <div className="flex w-full flex-1 flex-col items-stretch px-4 pb-24 pt-12 sm:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg p-1.5 text-base-content/55 hover:bg-base-200 hover:text-base-content"
          aria-label="放弃,返回首页"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div className="text-xs uppercase tracking-wide text-base-content/45">
          新想做的事
        </div>
      </div>

      {stage === 'prompt' && (
        <PromptStage
          prompt={prompt}
          setPrompt={setPrompt}
          inputRef={inputRef}
          onSubmit={() => {
            if (!prompt.trim()) return;
            setAnswers({});
            setCurrentQ(0);
            setStage('clarifying');
          }}
        />
      )}

      {stage === 'clarifying' && proposal && (
        <ClarifyingStage
          prompt={prompt}
          proposal={proposal}
          answers={answers}
          currentQ={currentQ}
          onAnswer={(qid, value) => {
            setAnswers((a) => ({ ...a, [qid]: value }));
            // Advance to next q or finish
            if (currentQ < proposal.questions.length - 1) {
              setCurrentQ((i) => i + 1);
            } else {
              setStage('preview');
            }
          }}
          onSkipAll={() => setStage('preview')}
          onRestart={restart}
        />
      )}

      {stage === 'preview' && proposal && (
        <PreviewStage
          prompt={prompt}
          proposal={proposal}
          answers={answers}
          recommendedTeam={recommendedTeam}
          onBack={() => setStage('clarifying')}
          onRestart={restart}
          onConfirm={goSpawn}
        />
      )}

      {stage === 'spawning' && proposal && <SpawningStage proposal={proposal} />}
    </div>
  );
}

/* ─── Stage 1: prompt ─── */

function PromptStage({
  prompt,
  setPrompt,
  onSubmit,
  inputRef,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">想做什么?</h1>
        <p className="mt-2 text-sm text-base-content/60">
          一句话告诉我就行 —— 不用想清楚,我帮你理。
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-3 rounded-2xl bg-base-200 p-4 shadow-sm focus-within:ring-2 focus-within:ring-primary/40"
      >
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="比如:帮我准备一次去日本看樱花的旅行……"
          rows={3}
          className="resize-none bg-transparent text-base placeholder:text-base-content/40 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-content shadow disabled:bg-base-300 disabled:text-base-content/40"
          >
            继续 →
          </button>
        </div>
      </form>

      <div>
        <div className="mb-2 px-1 text-xs uppercase tracking-wide text-base-content/45">
          或者试试这些
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTER_CHIPS.map((c) => (
            <button
              key={c.text}
              type="button"
              onClick={() => {
                setPrompt(c.text);
                inputRef.current?.focus();
              }}
              className="flex items-center gap-1.5 rounded-full bg-base-200/70 px-3 py-1.5 text-sm text-base-content/80 ring-1 ring-base-300/40 transition hover:bg-base-200 hover:ring-primary/30"
            >
              <span aria-hidden>{c.icon}</span>
              {c.text}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-base-content/40">
        我会先问你几个小问题,等你确认了再正式开个项目。
      </p>
    </div>
  );
}

/* ─── Stage 2: clarifying (Q&A, one at a time) ─── */

function ClarifyingStage({
  prompt,
  proposal,
  answers,
  currentQ,
  onAnswer,
  onSkipAll,
  onRestart,
}: {
  prompt: string;
  proposal: Proposal;
  answers: Record<string, string>;
  currentQ: number;
  onAnswer: (qid: string, value: string) => void;
  onSkipAll: () => void;
  onRestart: () => void;
}) {
  const [draft, setDraft] = useState('');
  const total = proposal.questions.length;
  const q = proposal.questions[currentQ];

  // Reset draft when moving to next question
  useEffect(() => {
    setDraft('');
  }, [currentQ]);

  return (
    <div className="flex flex-col gap-5">
      {/* User's prompt */}
      <UserBubble>{prompt}</UserBubble>

      {/* Proposed intent name preview */}
      <article className="flex items-center gap-3 rounded-2xl bg-base-200/70 p-3 ring-1 ring-base-300/40">
        <span
          className="grid h-11 w-11 place-items-center rounded-2xl text-2xl shadow-sm"
          style={{ background: proposal.cover }}
        >
          {proposal.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-base-content/45">
            建议给这件事起名
          </div>
          <div className="truncate text-[15px] font-semibold">{proposal.title}</div>
        </div>
      </article>

      {/* Intro (once) */}
      {currentQ === 0 && (
        <AssistantBubble>{proposal.intro}</AssistantBubble>
      )}

      {/* Already-answered questions echo */}
      {proposal.questions.slice(0, currentQ).map((pq, i) => (
        <div key={pq.id} className="flex flex-col gap-2">
          <AssistantBubble small>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
              第 {i + 1} 问
            </span>
            <span className="ml-2">{pq.text}</span>
          </AssistantBubble>
          <UserBubble small>{answers[pq.id]}</UserBubble>
        </div>
      ))}

      {/* Current question */}
      <div className="flex flex-col gap-3">
        <AssistantBubble>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
            第 {currentQ + 1} 问 · {currentQ + 1}/{total}
          </div>
          <div>{q.text}</div>
        </AssistantBubble>

        {/* Option chips */}
        <div className="flex flex-wrap gap-2 pl-1">
          {q.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onAnswer(q.id, opt)}
              className="rounded-full bg-base-100 px-3 py-1.5 text-sm text-base-content/80 ring-1 ring-base-300/40 transition hover:bg-base-200 hover:ring-primary/40"
            >
              {opt}
            </button>
          ))}
        </div>

        {/* Free-text fallback + per-question skip */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onAnswer(q.id, draft.trim());
          }}
          className="flex items-center gap-2 rounded-2xl bg-base-200 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/40"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="或者自己说……"
            className="flex-1 bg-transparent text-[14px] placeholder:text-base-content/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onAnswer(q.id, '(跳过)')}
            className="rounded-full px-3 py-1.5 text-xs text-base-content/55 hover:bg-base-300 hover:text-base-content/80"
            title="跳过这条"
          >
            跳过
          </button>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-content disabled:bg-base-300 disabled:text-base-content/40"
          >
            下一问 →
          </button>
        </form>
      </div>

      {/* Footer: skip / restart */}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full bg-base-200/70 px-4 py-2 text-xs text-base-content/65 hover:bg-base-200"
        >
          ← 改一改我说的
        </button>
        <button
          type="button"
          onClick={onSkipAll}
          className="rounded-full bg-base-200/70 px-4 py-2 text-xs text-base-content/65 hover:bg-base-200"
        >
          先这样,直接开始 →
        </button>
      </div>
    </div>
  );
}

/* ─── Stage 3: preview (plan + agent team) ─── */

function PreviewStage({
  prompt,
  proposal,
  answers,
  recommendedTeam,
  onBack,
  onRestart,
  onConfirm,
}: {
  prompt: string;
  proposal: Proposal;
  answers: Record<string, string>;
  recommendedTeam: string[];
  onBack: () => void;
  onRestart: () => void;
  onConfirm: () => void;
}) {
  const answeredCount = Object.values(answers).filter((v) => v && v !== '(跳过)').length;
  return (
    <div className="flex flex-col gap-5">
      {/* User prompt echo */}
      <UserBubble>{prompt}</UserBubble>

      {/* Answers echo, compact */}
      {answeredCount > 0 && (
        <div className="rounded-2xl bg-base-200/60 p-3 ring-1 ring-base-300/40">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
            你说的
          </div>
          <ul className="space-y-1 text-[13px] text-base-content/75">
            {proposal.questions.map((q) =>
              answers[q.id] && answers[q.id] !== '(跳过)' ? (
                <li key={q.id}>
                  <span className="text-base-content/45">·</span>{' '}
                  <span className="text-base-content/55">{q.text}</span>{' '}
                  <span className="font-medium text-base-content/85">{answers[q.id]}</span>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}

      {/* Intent name + plan */}
      <article className="overflow-hidden rounded-2xl bg-base-100 shadow-md ring-1 ring-base-content/10">
        <header className="flex items-center gap-3 border-b border-base-300/40 p-4" style={{ background: proposal.cover }}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/25 text-2xl backdrop-blur-sm">
            {proposal.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-white/70 drop-shadow-sm">
              准备开个
            </div>
            <div
              data-testid="preview-title"
              className="truncate text-lg font-bold text-white drop-shadow-sm"
            >
              {proposal.title}
            </div>
          </div>
        </header>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
            我会这样开始
          </div>
          <ol className="mt-2 space-y-2">
            {proposal.planPreview.map((step, i) => (
              <li key={step} className="flex items-start gap-2.5 text-[14px] leading-snug">
                <span
                  aria-hidden
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 border-t border-base-300/40 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
              会帮你的助手
            </div>
            <div data-testid="preview-team" className="mt-2 flex flex-wrap gap-1.5">
              {recommendedTeam.map((id) => {
                const a = findBuiltinAgent(id);
                if (!a) return null;
                return (
                  <span
                    key={a.id}
                    data-testid={`preview-team-${a.id}`}
                    className="badge badge-soft badge-primary gap-1.5"
                    title={a.pitch}
                  >
                    <span aria-hidden>{a.emoji}</span>
                    {a.name}
                  </span>
                );
              })}
              <span className="text-[11px] text-base-content/45 self-center pl-0.5">
                · 进去后可以加 / 移除
              </span>
            </div>
          </div>
        </div>
      </article>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full bg-base-200/70 px-4 py-2 text-xs text-base-content/65 hover:bg-base-200"
          >
            ← 重说
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-full bg-base-200/70 px-4 py-2 text-xs text-base-content/65 hover:bg-base-200"
          >
            改答案
          </button>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-content shadow-lg shadow-primary/25 hover:opacity-95"
        >
          开始这件事 →
        </button>
      </div>
    </div>
  );
}

/* ─── Stage 4: spawning ─── */

function SpawningStage({ proposal }: { proposal: Proposal }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-24 pt-12 text-center">
      <span
        className="grid h-20 w-20 place-items-center rounded-3xl text-4xl shadow-lg"
        style={{ background: proposal.cover }}
      >
        {proposal.emoji}
      </span>
      <div>
        <div className="text-xs uppercase tracking-wide text-base-content/45">正在为你准备…</div>
        <h2 className="mt-1 text-xl font-semibold">{proposal.title}</h2>
      </div>
      <div className="flex items-center gap-2 text-sm text-base-content/55">
        <span className={cn('h-2 w-2 animate-pulse rounded-full bg-primary')} />
        <span>把这件事记下来,把对话准备好…</span>
      </div>
    </div>
  );
}

/* ─── Shared chat bubbles ─── */

function UserBubble({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div
      className={cn(
        'self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 leading-relaxed text-primary-content shadow-sm',
        small ? 'max-w-[75%] text-[13px]' : 'max-w-[85%] text-[15px]',
      )}
    >
      {children}
    </div>
  );
}

function AssistantBubble({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        'max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-base-200 px-4 py-2.5 leading-relaxed shadow-sm',
        small ? 'text-[13px]' : 'text-[15px]',
      )}
    >
      {children}
    </div>
  );
}
