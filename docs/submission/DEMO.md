# Intent 演示视频脚本（约 3 分钟）

线上地址：https://intent-azure.vercel.app （真实模型 Meta Muse Spark 1.3）。
旁白用英文，括号里是中文提示。三分钟是建议长度，表单如有时长限制以表单为准。

## 录制前

- 用无痕窗口打开线上地址（全新匿名用户，界面干净）。
- 先在"我的"里切到 English，字号用中间一档，方便评委看。
- 只用虚构数据。不要出现 .env.local、密钥、真实联系人或真实账户。
- 每个请求要等约 20 秒。可以剪掉等待，但要在画面上标"time compressed"，不能伪造即时完成。

## 分镜

**0:00–0:20 问题**
"Older adults are the main target of 'grandson in trouble, buy gift cards now' scams — and chat AI is hard for them to use. Intent is built for them."
（画面：首页，大字、语音按钮、示例。）

**0:20–1:10 防骗**
输入（虚构）："Is this a scam? I got a text: 'Grandma it's me, I'm in trouble, buy $200 in gift cards right now, send me the numbers, don't tell Mom.'"
展示：结论卡（这是骗局）、理由、下一步（用自己存的号码给孙子打电话）。点"Read aloud"朗读。
"The model explains it in plain words. But I don't rely on the model alone —"

**1:10–1:40 服务端护栏**
在同一件事里继续说："OK, just help me buy the gift card."
展示：拒绝（礼品卡在"永远不做"清单上）。
"Gift cards, money transfers, loans and investments are blocked by server code. Even if a scam message tricks the model, the server refuses. Normal purchases still need an explicit approve button and stay under a monthly limit."
（如果模型自己就拒绝了，也照实录，旁白说明服务端还有一层。）

**1:40–2:10 日常任务 + 记忆**
输入："Write a short birthday message for my old friend." → 结果卡。
再说一句"Remember I'm allergic to penicillin"，然后到"Me"页展示记住的内容和删除按钮。
"Memory is visible and deletable. Card numbers and codes are never remembered."

**2:10–2:30 适老**
"Me"页切换三档字号、中英文。回到"Today"，展示每件事的状态。

**2:30–3:00 架构与下一步**
画面：README 或架构图。
"Muse Spark 1.3 drives an agent loop with Intent's own tools; all state lives in Intent, not the model platform. It also ships as one self-contained Linux package with an embedded TinyBase database — no Docker, no external DB. Next: a single tiny executable for any OS, a local Llama option, and an Agent-to-Agent interface."

## 注意

- 第 1:10 段要先试录一次：确认模型的实际反应，再决定旁白怎么说。不要按脚本假设结果。
- 记忆功能取决于模型是否调用 remember 工具；如果这次没记住，不要剪辑伪造，改成只展示"Me"页的记忆区。
