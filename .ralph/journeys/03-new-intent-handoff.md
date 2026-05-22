persona: maker(DZ), 跨多个项目, 高密度使用
goal: 起一件新事 → 回答澄清问题 → 进 chat 看到我的话已经在对话里
spec_file: e2e/journey-03-new-intent-handoff.spec.ts

## Steps

1. 登录 → /new
2. 在 prompt 输入 "帮我策划周末野营"
3. 系统进 clarifying stage, 答 3 个问题:
   - "几个人?" → "4 大 2 小"
   - "什么地方?" → "怀柔郊外有湖的地方"
   - "什么时候?" → "下下周末"
4. 进入 preview stage, 看到 "你说的:" 摘要列出 3 个回答
5. 点 "开始这件事" → 跳转 /intent/<new-id>
6. 在 chat 历史里查看

## Pass criteria

- /intent/<new-id> 首次加载时, chat 里至少有一条 user 消息
- 该 user 消息内容**包含** prompt 原文 "周末野营"
- 该 user 消息内容**包含** 至少 2 个 clarifying 答案文本片段
  (e.g. "4 大 2 小" 或 "怀柔" 或 "下下周末")
- 该 user 消息之后**有一条 assistant 消息**, 不是 typing dot 卡死
- 刷新页面后 chat 历史还在 (消息 INSERT 是真持久化, 不是 in-memory)

## Known fail modes

- NewIntent.tsx:452 直接 navigate, 没把 prompt/answers 发到 chat
- chat 历史空白, assistant 不会主动起 (因为没收到 user 输入)
- 用户的回答全丢

## Implementation hints

两条路径任选其一:
- A. 在 navigate 前 INSERT 一条 user message + 用 sessions.send 触发
  gateway, 让助手响应; 然后才 navigate
- B. navigate 时把 kickoff text 作为 search param (e.g. /intent/$id?kickoff=...),
  IntentHome 在 mount useEffect 里读到就 chat.send(text) 一次, 然后
  navigate replace 清掉 search 防止刷新重发

路径 B 更轻量, 不需要在 NewIntent 拿到 gateway session
