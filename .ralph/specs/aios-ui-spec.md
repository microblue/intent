# MyClaw AIOS — Phase 1 UI Spec

**Status**: Phase 1 prototype complete · approved for Phase 2 backend wiring
**Scope**: Single-page Vite + React 19 SPA shipped to `app.myclaw.one` (web shell)
**Repo**: `~/myclaw-aios/`
**Companion**: Architectural canon stays in `~/myclaw-studio/docs/aios-plan.md`; this doc is the UX/UI delta as it actually shipped.

---

## 1. Methodology

MyClaw frames "做一件事" as a 6-phase loop. Every concept in the data model and every page in the UI maps onto this loop. Phases are not rigid — the user can re-enter any phase from any other.

| # | Phase | User-facing | Internal name | UI anchor |
|---|---|---|---|---|
| ① | 说想做什么 | I want to plan a trip / pick a gift / learn N3 | **Intent** | `/new` clarifying interview |
| ② | 拆开看看 | help break it down | **Plan** (`OutlineNode[]`) | Right rail "计划" window with expandable Steps |
| ③ | 找人手 | which helpers participate | **Agent team** (`bindingsFor(intentId)`) | Right rail "助手团队" window; dynamic mid-thread join in Phase 1.5 |
| ④ | 跑起来 | helpers execute, ask user when needed | **Steps + Approvals** | Inline trace badges in chat; pending approvals in `/now` |
| ⑤ | 沉下来 | outputs and learning persist | **Files / Memory / Schedule** | Three rail windows + standalone pages |
| ⑥ | 回头看 / 拐弯 | look back, reflect, pivot | **Thread Outline + 复盘卡** | Right rail "大纲" window + slim-header "完成" reflection modal |

The clarifying interview (`/new` stages 1→2) and the reflection card (`/intent/$id` 复盘 modal) are the entry and exit gates of the loop. Memory is the cross-Intent persistence layer: 复盘 lessons go in, future clarifying interviews can pull them out.

---

## 2. Concept catalog (lay-user → internal)

| 用户看到的词 | 内部数据名 | 一句话定义 |
|---|---|---|
| 想做的事 | Intent | 一件你想 MyClaw 帮你做完的事;有自己的对话、计划、文件、助手团队 |
| 助手 | Agent | 帮你做具体一类活儿的小员工;研究员、写手、规划员…… |
| 计划 | OutlineNode tree | 这件事拆出来的步骤清单;可包含 OutlineStep 子步骤 |
| 大纲 | ThreadOutlineEntry | 这件事整条 thread 的鸟瞰图(起点 / 决定 / 想法 / 里程碑 / 新计划) |
| 记得的事 | MemoryFact + UserMemoryFact | 跨 Intent 通用的小事实(偏好、家人生日)+ 复盘留下的经验 |
| 提醒 | ScheduleEvent | 时间或事件触发的提醒 |
| 等你点头 | Approval | 助手做高影响动作前的确认 |
| 文件 | IntentFile | 这件事的产出物 |
| 进度 | (Outline `done` counts) | 哪些步骤已经做完 |
| 正在做的事 | NowActivity | 跨 Intent 的实时动态 |
| 底层引擎 | Engine binding | 开发者模式可见 — 哪些 OpenClaw agents + 哪个 Hermes profile |

---

## 3. Surfaces shipped

### 3.1 Routes

| Path | Page | Status |
|---|---|---|
| `/` | IntentList — card grid + starter templates | ✓ |
| `/intent/$intentId` | Intent home — chat + windowed rail | ✓ |
| `/new` | NewIntent — 4-stage clarifying interview | ✓ |
| `/schedule` | 提醒 | ✓ |
| `/memory` | 记得的事(static groups + 从复盘学到的) | ✓ |
| `/permissions` | 助手能做什么 | ✓ |
| `/now` | 正在做的事 | ✓ |
| `/help` | 帮助 / 概念地图(保留双语) | ✓ |
| `/settings` | 设置 + 语言切换 + 激活码 + 开发者模式 | ✓ |
| `/settings/engines` | 开发者模式底层引擎(保留双语) | ✓ |

### 3.2 Persistent chrome

- **AppShell** (`src/components/AppShell.tsx`) — horizontal `PanelGroup` (react-resizable-panels) with Sidebar + content. Sidebar collapsible to a narrow 5–6% icon-only rail; user-resizable 15–26%. Mobile: no sidebar, BottomDock as primary nav.
- **Sidebar** — brand mark (custom SVG + duotone wordmark) / search button / hero CTA "新想做的事" (gradient pill) / 5 colored nav items / "最近" recent intents / user footer.
- **BottomDock** — 5-slot mobile tab bar: 想做的事 / 提醒 / ✨ 新建 (raised) / 通知 / 我的.
- **Launcher** (`cmdk`) — Cmd+K full-screen modal with visible search-button fallback in sidebar.

### 3.3 Intent home internal layout

Desktop: nested `PanelGroup` (chat | rail).
- Chat panel min 45%. Contains SlimHeader (sticky, cover gradient) + Conversation + StickyComposer.
- Rail panel default 28%, min 23%, max 42%. Each section is an independent "window" with:
  - Drag-to-reorder title bar (HTML5 DnD; `text/x-rail-section` MIME)
  - Minimize / Close buttons
  - State persisted in Zustand (`railOrder` / `railMinimized` / `railHidden`)
- Rail windows: 大纲 / 计划 / 产出文件 / 助手团队 / 记得的事 / 提醒 / 底层引擎 (dev-mode only). Plus 等点头 alert and stat-row above.

Mobile: iMessage-shaped — thin sticky gradient header + chat full-bleed + composer. Rail content lives in a bottom-sheet `InfoSheet` triggered by ⋮ icon. Sheet contains 大纲 (top, default-open) + 计划 + 文件 + dev binding.

### 3.4 Chat shape

- **User message**: right-aligned `bg-primary` pill bubble; time on a separate small line below.
- **Assistant message**: full-width prose article — small avatar header (28px) + name + time row; optional `💭 我记得你提过` annotation; **unboxed body** (15px leading-relaxed) so longer responses read as writing, not SMS; optional trace strip below body with `用了 X` capability badges + agent trace chips.
- **Typing indicator**: 3-dot animated bubble shown when `useChatThread.typing === true`.

Messages get `id="msg-<id>"` anchors so `ThreadOutlineEntry` clicks can scrollIntoView + flash a primary ring for 1.6s.

### 3.5 Right-rail window order (default)

1. 大纲 (open) — bird's-eye TOC with click-to-jump
2. 计划 (open) — task tree with execution Steps timeline
3. 产出文件 (open)
4. 助手团队 (open)
5. 记得的事 (minimized)
6. 提醒 (minimized)
7. 底层引擎 (dev only, minimized) — bilingual label preserved here

---

## 4. Design language

| Token | Value | Notes |
|---|---|---|
| **Fonts** | `Inter` (Latin) + `PingFang SC` → `HarmonyOS Sans SC` → `Noto Sans SC` (CJK) + `JetBrains Mono` | Per-character fallback for mixed-script |
| **Base size** | 17px html (vs default 16) | Tailwind rem scale derives from this |
| **Text scale** | `text-xs 12.5px / text-sm 15px / text-base 16px / text-lg 18px / text-xl 21px` | Custom in `@theme` block |
| **CJK rendering** | `font-feature-settings: 'cv11' 'ss03' 'tnum'` + `word-break: normal` + `overflow-wrap: anywhere` | No mid-syllable breaks |
| **Anti-alias** | `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale` | |
| **Default theme** | `aios-light` (with `prefersdark` flip to `aios-light`) | DaisyUI plugin config |
| **Brand mark** | Custom SVG: 3 gradient claw-arcs + accent dot | Duotone wordmark — "my" base, "claw" gradient |
| **Nav identity** | Per-item tint: primary / warning / info / accent / success | Idle = soft, active = saturated + tinted shadow |
| **Icon containers** | 44×44 rounded-2xl (nav), 40×40 rounded-xl (recent intents), 36×36 (rail meta) | Always fixed size to anchor variable-width emojis |
| **Spacing rhythm** | 4 / 8 / 12 / 16 / 24 px | DaisyUI `gap-*` / `space-*` |

---

## 5. Component pattern hierarchy

DaisyUI components first, Tailwind only for layout / spacing / colors that DaisyUI doesn't own.

Heavy usage (file count):
- `badge` ×54, `btn` ×31, `stats/stat` ×24, `chat` ×16, `collapse` ×14, `modal` ×12, `input/textarea` ×17, `dock` ×12, `card` ×8, `kbd` ×6, `tab/tabs` ×7, `alert` ×3, `progress` ×3, `menu` ×3, plus `toggle`, `select`, `swap`, `avatar`, `footer`, `divider`.

Custom patterns:
- **封面卡** — gradient-cover + emoji + title, the visual nucleus reused across IntentCard / SlimHeader / preview cards / template cards. Same gradient lives in `intent.cover` as a CSS gradient string.
- **RailWindow** — card with cursor-grab title bar (drag handle ⋮⋮), minimize/close buttons, body collapse-on-minimize.
- **OutlineRow** — checkbox + label + step counter + chevron; expandable Steps timeline below with status bullets.
- **ThreadOutlineView** — left-rail vertical timeline; per-entry colored dot + kind chip + relative time + click-to-jump.
- **TypingIndicator** — 3-dot animated bubble.

---

## 6. State management

**Zustand** (`src/state/ui.ts`), with `persist` middleware (`name: 'myclaw-ui-v2'`):

Persisted:
- `devMode` — developer-mode toggle
- `intentRailOpen` — rail visibility
- `sidebarCollapsed` — left sidebar narrow mode
- `railOrder` — `RailSectionKey[]` order
- `railMinimized` / `railHidden` — per-section state
- `userMemoryFacts` — 复盘卡 saved lessons

Transient:
- `launcherOpen`, `userMenuOpen` — UI flashes

PanelGroup sizes persist separately via `autoSaveId` to `localStorage` keys `aios-shell-v2` and `aios-intent-v3`.

---

## 7. Per-device paradigm

| Device | Width | Nav model | Intent home shape |
|---|---|---|---|
| Phone | < 768 | BottomDock (5-slot tab bar) | iMessage: sticky thin header + chat + InfoSheet bottom-sheet for detail |
| Tablet / laptop / desktop | ≥ 768 | Persistent left Sidebar (resizable, collapsible to icons) | Workspace: chat panel + windowed right rail |
| Wide screens (xl+) | ≥ 1280 | Same as desktop, denser column counts | IntentList grid up to 5 columns |

The chat route on mobile hides the BottomDock (composer owns the bottom).

---

## 8. Mock data shape

All under `src/mocks/`. Forward-compatible with Phase 6 Supabase schema — type names match table names that will exist:

- `intents.ts` — Intent[], Message[], OutlineNode[] (with `steps: OutlineStep[]`), IntentFile[], AgentTrace[], ThreadOutlineEntry[]
- `schedule.ts` — ScheduleEvent[]
- `memory.ts` — MemoryFact[]
- `permissions.ts` — Capability[], CapabilityGrant[]
- `agents.ts` — Agent[], HermesProfile[], intentBindings record
- `now.ts` — Approval[], NowActivity[]

`Message.content` is `MessageContentPart[]` (text/image/file_ref) — jsonb-shape from day one as the plan requires.

---

## 9. Mock vs. real wiring (Phase 6 map)

| Mock today | Real in Phase 6 |
|---|---|
| `messagesFor(intentId)` static seed | Supabase realtime subscription |
| `useChatThread.send` → `mockReply()` keyword reflection | WebSocket stream from Hermes gateway |
| `bindingsFor(intentId)` static record | Supabase `intent_agent_bindings` table |
| `/new` keyword classifier picks template | OpenClaw "intent inferencer" agent |
| Plan steps hardcoded | Real `agent_traces` table populated by agent runtime |
| 复盘 lessons hardcoded by category | LLM-generated from conversation history |
| Engine binding chip (dev mode) | Live status from gateway WS |
| Approval gates → toast | Actual `approvals` table + gateway action gating |
| Files preview hardcoded | Supabase Storage URLs + opener integrations |
| Schedule events static | Postgres `pg_cron` jobs + notification fanout |
| Memory facts static | Continuously written by memory agent + retrievable by RAG |

Architectural rule (do not violate): SPA reads Supabase directly (anon key + RLS). `apps/api` is reserved for writes that need service-role key (open claw / Polar webhook / admin / email). Composer "send" will go through `apps/api` for the write, then the resulting message arrives back via Supabase realtime.

---

## 10. UX conventions

1. **Lay-user-first copy**. Never expose internal terms (Intent / Agent / Orchestrator) in primary copy. Internal names show in the concept catalog (`/help`) and dev mode only.
2. **One main thing per surface**. No dashboards. Cards are large, whitespace is generous.
3. **No CLI aesthetic**. No monospace except `kbd`, dev binding code chips, and trace `agent.key` annotations.
4. **Errors are friendly**. "没找到这个项目" / "可能链接过期了。回到首页看看?" not status codes.
5. **Empty states have onboarding copy**. IntentList shows 6 template cards. Memory / Schedule / Now show "here's what would go here" + an example list.
6. **Cmd+K is an accelerator**. Everything reachable via Cmd+K is also reachable by visible buttons.
7. **Settings/advanced folded away**. Developer mode behind a single Settings toggle.
8. **Big buttons, big text, large hit targets** — even on desktop. Nav rows are 56px tall, primary buttons are `btn-md` not `btn-sm`.

---

## 11. Methodology coverage today

| Phase | Coverage | Gap |
|---|---|---|
| ① 说想做什么 | ✓ `/new` with 6 template cards as cold-start entry | — |
| ② 拆开看看 | ✓ Clarifying interview generates plan preview | LLM-real plans in Phase 6 |
| ③ 找人手 | ✓ Initial team in preview; team window in rail | Dynamic mid-thread join (Phase 1.5) |
| ④ 跑起来 | ✓ Step timeline, trace badges, mock reply loop | Real WS stream in Phase 6 |
| ⑤ 沉下来 | ✓ Files / Memory / Schedule rail windows; cross-page navigation | Real persistence in Phase 6 |
| ⑥ 回头看 / 拐弯 | ✓ Thread Outline + 复盘 modal → UserMemoryFact in Memory | LLM-generated lessons in Phase 6 |

---

## 12. Phase 2 prerequisites

Before backend wiring starts:
- This document approved and committed
- `~/myclaw-aios/` HEAD is a stable demo (it is: production deployed to `myclaw-aios.vercel.app`, all routes 200)
- Supabase schema additions identified: `user_preferences`, `devices`, `notifications`, `claw_grants`, `chat_outline` (anchored to messages), `agent_runs` (for the step timeline)
- Migration files land in `~/myclaw/supabase/migrations/`, not in this repo

---

**Approved by**: DZ
**Cut**: 2026-05-18
**Next**: Phase 2 — Supabase auth/RLS wiring + WebSocket reconnect adapter + Edge Function scaffolding
