import type {
  AgentTrace,
  Intent,
  IntentFile,
  Message,
  OutlineNode,
  ThreadOutlineEntry,
} from './types';

// Note on dates: we anchor to a fixed "now" so the mock is stable across reloads.
const NOW = new Date('2026-05-13T10:30:00+08:00');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();
const hoursAgo = (n: number) => minutesAgo(n * 60);
const daysAgo = (n: number) => hoursAgo(n * 24);

export const intents: Intent[] = [
  // Newly-spawned intent — used as the demo target for the /new flow.
  // Kept first so it appears prominently in the Intent list after "开始这件事".
  {
    id: 'birthday',
    emoji: '💝',
    title: '老婆 Lisa 的生日',
    cover: 'linear-gradient(135deg, oklch(78% 0.15 350), oklch(72% 0.13 290))',
    lastActiveAt: minutesAgo(1),
    preview: '刚开了头 — 离 7/8 还有大概 2 个月',
    trigger: 'manual',
    lifecycle: 'active',
  },
  {
    id: 'sakura',
    emoji: '🌸',
    title: '京都樱花季旅行',
    cover: 'linear-gradient(135deg, oklch(78% 0.13 350), oklch(72% 0.14 30))',
    lastActiveAt: minutesAgo(8),
    preview: '已经定好了 4 月 5 号到 4 月 11 号的行程,在帮你比机票',
    trigger: 'manual',
    lifecycle: 'pinned',
  },
  {
    id: 'mom-phone',
    emoji: '📱',
    title: '教妈妈用智能手机',
    cover: 'linear-gradient(135deg, oklch(75% 0.13 80), oklch(72% 0.13 30))',
    lastActiveAt: hoursAgo(3),
    preview: '准备了一份图文教程,下次回家可以一起看',
    trigger: 'manual',
    lifecycle: 'active',
  },
  {
    id: 'dinner',
    emoji: '🍳',
    title: '这周的晚饭',
    cover: 'linear-gradient(135deg, oklch(76% 0.13 140), oklch(72% 0.13 200))',
    lastActiveAt: hoursAgo(20),
    preview: '本周菜单已发到你的微信。周三要去买菜',
    trigger: 'cron',
    lifecycle: 'active',
  },
  {
    id: 'japanese',
    emoji: '🗾',
    title: '学日语 N3',
    cover: 'linear-gradient(135deg, oklch(72% 0.16 290), oklch(70% 0.13 220))',
    lastActiveAt: daysAgo(2),
    preview: '今天的复习清单已经准备好啦',
    trigger: 'cron',
    lifecycle: 'active',
  },
  {
    id: 'living-room',
    emoji: '🛋️',
    title: '客厅装修',
    cover: 'linear-gradient(135deg, oklch(74% 0.10 50), oklch(70% 0.12 20))',
    lastActiveAt: daysAgo(4),
    preview: '在帮你对比 3 家窗帘店的报价',
    trigger: 'manual',
    lifecycle: 'active',
  },
  {
    id: 'job',
    emoji: '💼',
    title: '换工作准备',
    cover: 'linear-gradient(135deg, oklch(70% 0.13 260), oklch(72% 0.12 200))',
    lastActiveAt: daysAgo(7),
    preview: '简历改到了第 3 版,等你看看',
    trigger: 'manual',
    lifecycle: 'dormant',
  },
];

const textPart = (text: string) => [{ type: 'text' as const, text }];

export const messages: Message[] = [
  // ===== Birthday intent (spawn-flow target) =====
  {
    id: 'm-birthday-1',
    intentId: 'birthday',
    role: 'user',
    content: textPart('帮我准备老婆生日 — 7 月 8 号'),
    createdAt: minutesAgo(2),
  },
  {
    id: 'm-birthday-2',
    intentId: 'birthday',
    role: 'assistant',
    content: textPart(
      '好嘞 💝 离 7/8 还有大概 2 个月,提前准备最舒服。\n\n先问你两件事帮我把方向定下来:\n\n1) 你想给她一个惊喜,还是和她一起商量\n2) 大概预算多少 —— 心里有个数就好,不用精确\n\n说一两句,我会先列出几个方向给你挑。',
    ),
    createdAt: minutesAgo(1),
    agentTraceIds: ['t-birthday-1'],
  },

  // ===== Sakura intent (featured) =====
  {
    id: 'm-sakura-1',
    intentId: 'sakura',
    role: 'user',
    content: textPart('我想 4 月初去京都看樱花,大概一周。我和我老公,预算 2 万人民币。'),
    createdAt: daysAgo(1),
  },
  {
    id: 'm-sakura-2',
    intentId: 'sakura',
    role: 'assistant',
    content: textPart(
      '好的!我帮你规划一下 🌸\n\n京都樱花季最美的时段一般是 3 月底到 4 月初。结合你的时间,我建议 4 月 5 号到 4 月 11 号 —— 这一周樱花应该正盛,而且避开了清明小长假最挤的几天。\n\n我先帮你查了一下机票,从上海出发,直飞大阪关西机场往返大概 3200~4500 之间。你倾向早班还是晚班的航班?',
    ),
    createdAt: daysAgo(1),
    agentTraceIds: ['t-sakura-1', 't-sakura-2'],
    usedFactIds: ['mf-14'],
    usedCapabilityIds: ['ext-skyscanner'],
  },
  {
    id: 'm-sakura-3',
    intentId: 'sakura',
    role: 'user',
    content: textPart('早班吧,落地了还能玩半天。住宿你有推荐吗?'),
    createdAt: hoursAgo(20),
  },
  {
    id: 'm-sakura-4',
    intentId: 'sakura',
    role: 'assistant',
    content: textPart(
      '懂的~ 我在 Booking 上给你筛了 5 家性价比不错的:\n\n• 京都站附近(交通方便,适合多日跑景点)\n• 祇园(老京都氛围,晚上散步很舒服)\n• 岚山(去岚山竹林、天龙寺方便)\n\n按你 7 天的行程,我建议京都站住 5 晚 + 岚山住 1 晚 + 大阪住 1 晚(回程方便)。一会儿我把链接整理到右边的「文件」里。',
    ),
    createdAt: hoursAgo(20),
    agentTraceIds: ['t-sakura-3'],
    usedFactIds: ['mf-7'],
    usedCapabilityIds: ['ext-booking'],
  },
  {
    id: 'm-sakura-5',
    intentId: 'sakura',
    role: 'user',
    content: textPart('听起来不错。机票什么时候买比较好?'),
    createdAt: minutesAgo(15),
  },
  {
    id: 'm-sakura-6',
    intentId: 'sakura',
    role: 'assistant',
    content: textPart(
      '现在差不多就可以了 ✈️ 4 月头是日本樱花季最热门的出发日期,越靠近越贵。\n\n我在帮你盯春秋、吉祥、全日空三家的价格,只要往返合计跌破 3500 我就提醒你。可以吗?',
    ),
    createdAt: minutesAgo(8),
    agentTraceIds: ['t-sakura-4'],
    usedFactIds: ['mf-5', 'mf-9'],
    usedCapabilityIds: ['ext-skyscanner'],
  },

  // ===== Mom phone intent =====
  {
    id: 'm-mom-1',
    intentId: 'mom-phone',
    role: 'user',
    content: textPart('我妈刚换了新手机,什么都不会用。能不能帮我做一份教程?'),
    createdAt: hoursAgo(4),
  },
  {
    id: 'm-mom-2',
    intentId: 'mom-phone',
    role: 'assistant',
    content: textPart(
      '当然可以 💕 我做一份大字版的图文教程,从最基础的开始 —— 接电话、加联系人、打字、用微信、扫健康码、拍照存照片。\n\n你妈妈手机是华为还是小米?我截图的时候用对应的系统,她看着不会觉得对不上。',
    ),
    createdAt: hoursAgo(4),
    agentTraceIds: ['t-mom-1'],
  },
  {
    id: 'm-mom-3',
    intentId: 'mom-phone',
    role: 'user',
    content: textPart('华为的。她最关心的就是微信,跟我视频。'),
    createdAt: hoursAgo(3),
  },
  {
    id: 'm-mom-4',
    intentId: 'mom-phone',
    role: 'assistant',
    content: textPart(
      '收到。我把微信视频通话单独做一节,放在第一章,这样阿姨拿到教程第一眼看见的就是她最想学的。\n\n初稿已经放在右边「文件」里了,你看看顺不顺?觉得哪里太啰嗦或者不够清楚都可以告诉我。',
    ),
    createdAt: hoursAgo(3),
    agentTraceIds: ['t-mom-2'],
  },

  // ===== Dinner intent =====
  {
    id: 'm-dinner-1',
    intentId: 'dinner',
    role: 'assistant',
    content: textPart(
      '早安☀️ 本周菜单我已经发到你微信了。这周比较忙,我挑的都是 30 分钟以内能做完的家常菜。\n\n周三要去买菜,提醒已经设好,放心。',
    ),
    createdAt: hoursAgo(20),
    agentTraceIds: ['t-dinner-1'],
    usedFactIds: ['mf-8'],
    usedCapabilityIds: ['do-calendar'],
  },

  // ===== Japanese intent =====
  {
    id: 'm-jp-1',
    intentId: 'japanese',
    role: 'assistant',
    content: textPart(
      '今天的 N3 复习清单准备好啦 📚\n\n• 20 个单词(昨天错过 3 个,优先复习)\n• 5 道语法选择题\n• 一段 2 分钟的听力\n\n大概需要 25 分钟。你方便的时候点开就行,我陪着你。',
    ),
    createdAt: daysAgo(2),
    agentTraceIds: ['t-jp-1'],
  },
];

export const agentTraces: AgentTrace[] = [
  { id: 't-birthday-1', messageId: 'm-birthday-2', agentKey: 'planner', summary: '正在帮你想方向', status: 'done' },
  { id: 't-sakura-1', messageId: 'm-sakura-2', agentKey: 'researcher', summary: '查了京都樱花花期数据', status: 'done' },
  { id: 't-sakura-2', messageId: 'm-sakura-2', agentKey: 'flights', summary: '在 Skyscanner 比了 12 个航班', status: 'done' },
  { id: 't-sakura-3', messageId: 'm-sakura-4', agentKey: 'lodging', summary: '在 Booking 筛了 27 家酒店', status: 'done' },
  { id: 't-sakura-4', messageId: 'm-sakura-6', agentKey: 'flights', summary: '正在盯 3 家航司的票价', status: 'running' },
  { id: 't-mom-1', messageId: 'm-mom-2', agentKey: 'planner', summary: '规划了 8 章节目录', status: 'done' },
  { id: 't-mom-2', messageId: 'm-mom-4', agentKey: 'writer', summary: '写了第 1 章初稿', status: 'done' },
  { id: 't-dinner-1', messageId: 'm-dinner-1', agentKey: 'meal-planner', summary: '生成了一周菜单 + 采购单', status: 'done' },
  { id: 't-jp-1', messageId: 'm-jp-1', agentKey: 'tutor', summary: '从错题本挑出 20 个词', status: 'done' },
];

export const outline: OutlineNode[] = [
  // sakura
  { id: 'o-sakura-1', intentId: 'sakura', parentId: null, label: '行程框架', done: true },
  { id: 'o-sakura-2', intentId: 'sakura', parentId: 'o-sakura-1', label: '4/5 出发,4/11 回', done: true },
  { id: 'o-sakura-3', intentId: 'sakura', parentId: 'o-sakura-1', label: '京都 5 晚 + 岚山 1 晚 + 大阪 1 晚', done: true },
  {
    id: 'o-sakura-4',
    intentId: 'sakura',
    parentId: null,
    label: '机票',
    steps: [
      { id: 's-sakura-4-1', label: '查 4/5 出发候选航班', status: 'done', agentKey: 'travel', at: hoursAgo(20), result: '找到 12 个直飞 + 转机选项' },
      { id: 's-sakura-4-2', label: '筛掉转 2 次以上 / 红眼', status: 'done', agentKey: 'travel', at: hoursAgo(20), result: '剩 5 个候选' },
      { id: 's-sakura-4-3', label: '盯价格变化', status: 'running', agentKey: 'travel', at: minutesAgo(8), result: '当前最低 3680,目标 3500' },
      { id: 's-sakura-4-4', label: '到 3500 自动提醒你', status: 'todo' },
    ],
  },
  { id: 'o-sakura-5', intentId: 'sakura', parentId: 'o-sakura-4', label: '盯价格(3500 提醒)' },
  {
    id: 'o-sakura-6',
    intentId: 'sakura',
    parentId: null,
    label: '住宿候选',
    steps: [
      { id: 's-sakura-6-1', label: '京都站附近找连住 5 晚', status: 'done', agentKey: 'travel', at: daysAgo(1), result: '2 家候选' },
      { id: 's-sakura-6-2', label: '祇园安静 + 步行 8 分内', status: 'done', agentKey: 'travel', at: daysAgo(1), result: '2 家候选' },
      { id: 's-sakura-6-3', label: '岚山 1 晚温泉旅馆', status: 'done', agentKey: 'travel', at: daysAgo(1), result: '1 家候选' },
      { id: 's-sakura-6-4', label: '整理成对比表', status: 'todo' },
    ],
  },
  { id: 'o-sakura-7', intentId: 'sakura', parentId: null, label: '景点 & 必吃' },

  // mom-phone
  {
    id: 'o-mom-1',
    intentId: 'mom-phone',
    parentId: null,
    label: '第 1 章 微信视频通话',
    done: true,
    steps: [
      { id: 's-mom-1-1', label: '查老人手机操作图鉴 3 个来源', status: 'done', agentKey: 'researcher', at: hoursAgo(5), result: '收录 11 个常见误操作' },
      { id: 's-mom-1-2', label: '列出妈妈最容易卡的 6 个点', status: 'done', agentKey: 'planner', at: hoursAgo(4), result: '6 条' },
      { id: 's-mom-1-3', label: '写大字版图文初稿', status: 'done', agentKey: 'writer', at: hoursAgo(3), result: '8 页,字号 28 pt' },
    ],
  },
  {
    id: 'o-mom-2',
    intentId: 'mom-phone',
    parentId: null,
    label: '第 2 章 接电话 & 联系人',
    steps: [
      { id: 's-mom-2-1', label: '搜集华为系统接听界面截图', status: 'done', agentKey: 'researcher', at: hoursAgo(2), result: '3 张主屏 + 2 张锁屏' },
      { id: 's-mom-2-2', label: '起草分步图说', status: 'running', agentKey: 'writer', at: minutesAgo(15), result: '写到第 2 段' },
      { id: 's-mom-2-3', label: '加入「不认识的号码怎么办」一节', status: 'todo' },
    ],
  },
  { id: 'o-mom-3', intentId: 'mom-phone', parentId: null, label: '第 3 章 拍照 & 看照片' },
  { id: 'o-mom-4', intentId: 'mom-phone', parentId: null, label: '第 4 章 健康码 & 扫码' },

  // japanese
  { id: 'o-jp-1', intentId: 'japanese', parentId: null, label: '今日清单' },
  { id: 'o-jp-2', intentId: 'japanese', parentId: 'o-jp-1', label: '20 词复习' },
  { id: 'o-jp-3', intentId: 'japanese', parentId: 'o-jp-1', label: '5 道语法' },
  { id: 'o-jp-4', intentId: 'japanese', parentId: 'o-jp-1', label: '听力 2 分钟' },
];

/**
 * Thread Outline — bird's-eye TOC of each Intent. Entries anchor to specific
 * messages so clicking jumps the chat. Distinct from per-Plan task lists.
 */
export const threadOutline: ThreadOutlineEntry[] = [
  // sakura
  { id: 'to-sakura-1', intentId: 'sakura', messageId: 'm-sakura-1', kind: 'origin', text: '想去日本看樱花', at: daysAgo(4) },
  { id: 'to-sakura-2', intentId: 'sakura', messageId: 'm-sakura-2', kind: 'idea', text: '改成樱花季 3/28–4/4', at: daysAgo(3) },
  { id: 'to-sakura-3', intentId: 'sakura', messageId: 'm-sakura-3', kind: 'decision', text: '京都 5 晚 + 岚山 1 晚 + 大阪 1 晚', at: daysAgo(2) },
  { id: 'to-sakura-4', intentId: 'sakura', messageId: 'm-sakura-4', kind: 'plan', text: '拆出三块:机票/住宿/景点', at: daysAgo(1) },
  { id: 'to-sakura-5', intentId: 'sakura', messageId: 'm-sakura-5', kind: 'milestone', text: '行程框架定稿', at: hoursAgo(20) },
  { id: 'to-sakura-6', intentId: 'sakura', messageId: 'm-sakura-6', kind: 'decision', text: '机票目标价 ¥3500', at: minutesAgo(45) },

  // mom-phone
  { id: 'to-mom-1', intentId: 'mom-phone', messageId: 'm-mom-1', kind: 'origin', text: '教妈妈用新智能手机', at: hoursAgo(8) },
  { id: 'to-mom-2', intentId: 'mom-phone', messageId: 'm-mom-2', kind: 'plan', text: '拆成 4 章:微信/电话/拍照/扫码', at: hoursAgo(7) },
  { id: 'to-mom-3', intentId: 'mom-phone', messageId: 'm-mom-3', kind: 'idea', text: '改成华为版(妈妈用的)', at: hoursAgo(5) },
  { id: 'to-mom-4', intentId: 'mom-phone', messageId: 'm-mom-4', kind: 'milestone', text: '第 1 章 微信视频通话 完稿', at: hoursAgo(3) },
];

export const files: IntentFile[] = [
  // sakura
  { id: 'f-sakura-1', intentId: 'sakura', name: '京都 7 日行程草稿.md', kind: 'doc', preview: '4/5 出发,京都站 5 晚,岚山 1 晚……', updatedAt: minutesAgo(8) },
  { id: 'f-sakura-2', intentId: 'sakura', name: '住宿候选 5 家', kind: 'link', preview: '京都站 × 2、祇园 × 2、岚山 × 1', updatedAt: hoursAgo(20) },
  { id: 'f-sakura-3', intentId: 'sakura', name: '樱花花期参考图', kind: 'image', preview: '气象厅 2026 樱前线预测', updatedAt: daysAgo(1) },

  // mom-phone
  { id: 'f-mom-1', intentId: 'mom-phone', name: '教程初稿(华为版).pdf', kind: 'doc', preview: '第 1 章:微信视频通话,大字图文', updatedAt: hoursAgo(3) },

  // dinner
  { id: 'f-dinner-1', intentId: 'dinner', name: '本周菜单.md', kind: 'doc', preview: '周一番茄蛋面、周二红烧肉……', updatedAt: hoursAgo(20) },
  { id: 'f-dinner-2', intentId: 'dinner', name: '采购单', kind: 'doc', preview: '周三去买:猪五花、番茄、青菜…', updatedAt: hoursAgo(20) },

  // japanese
  { id: 'f-jp-1', intentId: 'japanese', name: '错题本.md', kind: 'doc', preview: '收录了 47 个易错点', updatedAt: daysAgo(2) },

  // living-room
  { id: 'f-living-1', intentId: 'living-room', name: '窗帘报价对比.md', kind: 'doc', preview: '宜家 / 玛雅 / 某宝店家三家对比', updatedAt: daysAgo(4) },

  // job
  { id: 'f-job-1', intentId: 'job', name: '简历 v3.pdf', kind: 'doc', preview: '上一版的反馈已经吸收', updatedAt: daysAgo(7) },
];
