# Intent Agent 运行层设计（可替换模型平台）

> 状态：设计稿（2026-10-25），随产品设计一起评审，评审通过后才开发。
> 约束：不能绑死一家平台；开发期一律用 Claude Haiku 5.5（`claude-haiku-5-5`）；旧数据全部丢弃。

## 1. 核心原则：状态归我们，平台只负责「干活」

所有用户看得到的东西，都以**我们自己的数据库为准**：消息、计划、交付物、等你点头的请求、提醒、记住的事。

模型平台（Managed Agents、直接调 Messages API、OpenRouter 上的其他模型……）只是**执行器**。它的会话可以随时丢掉，再用我们库里的数据重建上下文。这样：

- 换平台 = 换一个适配器，不用迁数据。
- 同一件事中途也能换平台。比如平台故障时降级到另一家。
- 前端永远只认我们定义的事件，不认任何平台的事件格式。

## 2. 关键设计：业务动作全部做成「我们自己的工具」

平台差异最大的地方是审批、记忆、定时、子任务。如果直接用平台自带的功能，就会被锁死。所以 Intent 的业务动作一律定义成**我们自己的工具**，由我们的后端执行，在任何平台上表现都一样：

| 工具 | 作用 | 为什么不用平台自带的 |
|---|---|---|
| `ask_user` | 向用户追问（带选项按钮） | 追问要渲染成大按钮卡片，不是一段文字 |
| `request_approval` | 请求用户点头（花钱、联系外人、删除东西） | 审批规则、家人代批、金额上限都是我们的业务逻辑 |
| `update_plan` | 更新这件事的计划和进度 | 计划要显示在卡片和「大纲」上 |
| `deliver` | 交付成果（行程、清单、文档） | 交付物存在我们的存储里，用户随时能看 |
| `remember` / `recall` | 记住或查找用户的长期信息 | 记忆跨事情共享，要能让用户看和删 |
| `schedule_followup` | 约定以后某个时间回来跟进 | 定时由我们的调度器触发，不依赖平台的定时功能 |
| `finish` | 宣布这件事办完 | 生命周期状态归我们管 |

平台**自带**的能力（网页搜索、抓取网页、代码沙盒）作为「可选能力」：平台有就开，没有就由我们提供替代工具，或者干脆不提供。

## 3. 适配器接口

```ts
/** 一个模型平台的适配器。前端和业务代码只依赖这个接口。 */
interface AgentRuntime {
  readonly id: 'managed-agents' | 'messages-loop' | string;
  readonly capabilities: {
    webSearch: boolean;
    sandbox: boolean;        // 能不能跑代码、读写文件
    longRunning: boolean;    // 用户离开后能不能继续干活
  };

  /** 为一件事开一个执行会话；context 由我们从数据库拼出来。 */
  start(input: { intentId: string; context: IntentContext }): Promise<RuntimeHandle>;

  /** 发一条用户输入：一句话、追问的回答、审批结果、工具结果。 */
  send(handle: RuntimeHandle, input: RuntimeInput): Promise<void>;

  /** 拉取平台事件，翻译成我们的标准事件。 */
  events(handle: RuntimeHandle, since?: string): AsyncIterable<IntentEvent>;

  /** 用户喊停。 */
  interrupt(handle: RuntimeHandle): Promise<void>;
}

/** 标准事件：前端和数据库只认这些。 */
type IntentEvent =
  | { type: 'reply.delta'; text: string; by: AgentRole }      // 流式回复
  | { type: 'reply.done'; messageId: string; by: AgentRole }
  | { type: 'activity'; label: string; by: AgentRole }        // 「正在查机票价格…」
  | { type: 'tool.call'; tool: OurToolName; input: unknown }  // 我们的工具，由后端执行
  | { type: 'idle' }                                          // 这一轮干完了
  | { type: 'error'; friendly: string; retryable: boolean }
  | { type: 'usage'; costCents: number };
```

`AgentRole` 是我们自己定义的角色（主助手、研究、写作……），不是平台的 agent id。平台里怎么实现多助手（Managed Agents 的多 agent 会话，或者我们自己的循环里开子调用），由适配器自己决定。

## 4. 两个首发适配器

| | `managed-agents` | `messages-loop` |
|---|---|---|
| 实现 | Claude Managed Agents：一件事一个 session，我们的工具注册成 custom tool | 我们自己的 worker 跑工具调用循环，调 Messages API |
| 能接哪些模型 | Claude 系列 | 任何支持工具调用的模型（Claude、OpenRouter 上的 DeepSeek / Gemini / Qwen 等） |
| 网页搜索 / 沙盒 | 平台自带 | 搜索用平台自带或第三方；没有沙盒 |
| 用户离开后继续干活 | 平台托管 | 靠我们的 worker（不能放在有执行时限的 Edge Function 里） |
| 用途 | 默认 | 降级、对比测试、便宜模型 |

**先做 `managed-agents`，同时用 `messages-loop` 跑同一套测试**，证明抽象没有漏。不在第二个适配器真正需要之前把它做得很完整。

## 5. 模型配置

- 模型名只出现在一个配置文件里，按角色配：`{ 主助手: 'claude-haiku-5-5', 研究: 'claude-haiku-5-5', … }`。
- 开发期全部 Haiku 5.5。上线前按角色做评测，再决定哪些角色升级。

## 6. 数据流

```
用户说一句话
  → agent-send（Edge Function）：写 messages 表 → runtime.send()
  → worker 读 runtime.events()：
       reply.*   → 写 messages 表（前端通过 Supabase Realtime 实时看到）
       activity  → 写 intent_activity（前端显示「正在…」）
       tool.call → 执行我们的工具 → 写对应的表 → runtime.send(工具结果)
                   request_approval → 写 approvals 表 → 等用户点头后再 send
       usage     → 累计到这件事和这个用户的花费上
```

**前端不再直连任何 agent 平台，只订阅 Supabase。** 这比现在「浏览器开着 WebSocket 等回复」简单得多，关掉页面也不会丢东西。

## 7. 安全

- 平台 API key 只在服务端。
- 每件事、每个用户设花费上限，到了暂停并告诉用户。
- `request_approval` 默认拒绝：用户不点头，就当没同意。
- 所有工具执行前都校验这件事属于当前用户。

## 8. 待产品设计确定后再定的

- 角色列表：用户到底需要几种「助手」，还是对用户只呈现一个 Intent？
- 哪些动作必须点头，金额阈值是多少。
- 家人代管的权限模型。
- 记忆的可见性和删除方式。
