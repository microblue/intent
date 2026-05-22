persona: 任何用户(数据展示正确性是基础线, 跟 persona 无关)
goal: intent 详情右栏 (大纲/进度/文件/助手) 显示的所有数字都是真的, 不是假数据
spec_file: e2e/journey-04-rail-honest-numbers.spec.ts

## Steps

1. 登录 → 起一件新事 "测试-honest-numbers-<ts>" → 进 /intent/<new-id>
2. 在右栏点开 "助手团队" — 看到几个 agent? (期望: ≥1, 至少有 main)
3. 在 chat 顶上点 AgentPicker — 看到几个 agent?
4. 切到 "大纲" / "进度" / "产出文件" 三个 section
5. 看右栏头部 stat row 上的 "助手 N 位 / 大纲 X 个 / 文件 Y 个"
6. 跨组件对比

## Pass criteria

- TeamPanel 显示的 agent 行数 = direct query `intent_agents WHERE intent_id = X` 的行数
- AgentPicker 显示的列表 ⊆ TeamPanel 显示的列表
  (chat picker 只能从团队里选, 不能选不在团队里的 agent)
- 右栏头部 "助手 N 位" 的 N = TeamPanel 行数
- 右栏头部 "大纲 X 个" 的 X = `intent_artifacts WHERE intent_id = X AND kind = 'outline_node'` 行数 (或 messages 派生的 outline 数据真实计数)
- 右栏头部 "文件 Y 个" 的 Y = `intent_artifacts WHERE intent_id = X AND kind = 'file'` 行数
- 整个流程没有任何 `[mock-in-real-mode]` console.error
- TeamPanel 上每个 agent 行**点击会触发可观测后果** (切活跃 agent + 触发 AgentPicker 同步更新)

## Known fail modes

- IntentHome.tsx:1339 `counts.agents` 从 `conceptCountsFor` 来 → 一律 mock
- outline/files 同样从 mocks 来 → 真模式下永远 0 (or wrong)
- TeamPanel.tsx:60 row 没有 onClick (只有 ✕ remove 按钮可点)
- AgentPicker.tsx 用 `BUILTIN_AGENTS` (12 个全部 personas), 不是只看团队
- /new flow 推荐 specialists 写进 intent_agents 之后, TeamPanel 上能看到, 但 stat row 计数显示 0

## Implementation hints

- 加 `useIntentArtifacts(intentId, kind)` hook, 真模式从 Supabase 读, mock 用现有 outlineFor/filesFor
- IntentHome 把 `conceptCountsFor()` 调用全部替换为这些 hook 的 `.length`
- AgentPicker 接收 team prop 或自己 useIntentTeam, 把列表过滤为 team 内
- TeamPanel row 加 onClick={ () => onPickAgent(agentKey) }, 用 useUI 或 props 传到 chat
