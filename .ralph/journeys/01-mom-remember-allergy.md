persona: 妈妈, 55 岁, 从没用过 AI, 用 myclaw 管家务
goal: 告诉助手女儿对花生过敏, 让它以后买零食时帮我避开
spec_file: e2e/journey-01-mom-remember-allergy.spec.ts

## Steps

1. 登录 → 在首页起一件新事 "给小雨准备生日礼物"
2. 进入 intent 后, 在 chat 里发一条: "提醒一下, 小雨对花生过敏, 不能买含花生的东西"
3. 等助手回复(至少有一条 assistant 消息)
4. 退出到 / → 起另一件事 "周末野营零食准备"
5. 在 chat 里发: "我女儿小雨, 给她带点零食路上吃"
6. 等助手回复

## Pass criteria (each is a separate expect)

- Step 6 助手回复包含 "花生" 二字 (helpdesk attention to the allergy)
- 或者: Step 3 之后, /memory 页面的 "重要的人" 分类下出现一条提到 "小雨" 和 "花生" 的记忆
- 或者(降级): Step 6 助手主动询问 "有没有过敏 / 忌口"
- /memory 页面 total 计数对得上 memory_facts 表里实际行数 (cross-component consistency)

## Known fail modes

- memory_facts 表没有任何自动写入路径 — chat 不会触发 INSERT
- UI 文案 "我会顺手把重要的事写下来" 是 aspirational, 实现为零
- 即使手动加, AgentPicker 切到不同 agent 之后不知道是否共享记忆

## Implementation hints

- 自动提取候选: chat user message 后台分析(关键词 / LLM call), 形成 candidate
  fact → 在 chat 旁出一个 "我把这个记下来好吗?" 的 confirm 卡 → 点 ✓ 后才
  INSERT memory_facts
- 跨 intent 读: 任何 chat send 之前, 把当前用户的 memory_facts 列表
  (限定为 about-you / people / preferences) 拼进 system prompt
