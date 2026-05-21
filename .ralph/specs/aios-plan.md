# MyClaw AIOS — Supabase 统一后台（"Windows 账号"模型）

## Context

DZ 准备把 MyClaw 重构为统一账号体系：登录一次，在任何 client（web `app.myclaw.one` 或桌面 `myclaw-desk`）都看到同一份个人数据 —— claw 列表、UI 偏好、订阅状态、设备等。心智模型是 Windows 漫游配置文件 / iCloud / Tailscale。

**关键现状（已通过 Explore 验证）：**
- `~/myclaw` 是 Turborepo monorepo，包含 `apps/api`（Hono + Supabase service-role）和 `apps/web`（角色未定）。
- **Supabase 项目已经存在**，credential 在 `~/.openclaw/credentials/myclaw-supabase.env`。
- 已有 schema：`~/myclaw/supabase/migrations/20260504000001_initial_schema.sql`，13 张表，含 `users`, `claws`, `ssh_keys`, `volumes`, `activation_codes`, `referrals`, `install_reports` 等。RLS 全开，**Polar**（不是 Stripe）已接进 `polar_customer_id / polar_subscription_id`。
- `~/myclaw-desk` 当前是 **Electron 39**，把 `~/myclaw-studio` 当 git submodule 嵌入。**本 plan 计划在 Phase 8 切换到 Tauri 2**（理由见后文"Tauri 2 vs Electron"节）。
- `~/myclaw-studio`（本仓）零 auth，settings 落在本地 JSON 文件 + SQLite。

**本次锁定的用户决策：**
- AIOS 在**独立仓 `~/myclaw-aios`**（不进 monorepo），原因：要同时部署到 Vercel（web）和塞进 Tauri 桌面 shell（webview）
- `apps/web` 用途未定 —— 不阻塞 AIOS 设计，但需要在 Phase 2 决断
- **硬切**：myclaw-studio 这条线在 Phase 0 收尾后就停止演化，AIOS 重新搭

---

## 顶层架构（4 平面）

```
                Identity & Registry Plane
                ┌─────────────────────────────┐
                │  Supabase (existing)        │
                │   ├─ Auth (email + OAuth)   │
                │   ├─ Postgres + RLS         │
                │   │    users, claws,        │
                │   │    user_preferences,    │
                │   │    devices, …           │
                │   ├─ Edge Functions         │
                │   │    mint_claw_token()    │
                │   └─ Realtime (claw status) │
                └──┬───────────────────────┬──┘
                   │                       │
            ┌──────┴──────┐                │
            │ apps/api    │                │
            │ Hono +      │                │
            │ service-key │                │
            │  (writes)   │                │
            └─────────────┘                │
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │  myclaw-aios (Vite SPA) │
                              │   ├─ anon Supabase      │
                              │   ├─ Shell adapter      │
                              │   │   (web / tauri)     │
                              │   │                     │
                              │   └─ Gateway WS client  │
                              └────────────┬────────────┘
                                           │
                                  Runtime Plane (per-claw)
                              ┌────────────┴────────────┐
                              │  Caddy: TLS + /ws       │
                              │  OpenClaw (untouched)   │
                              └─────────────────────────┘
```

四个平面，单一职责：
- **Identity & registry**：Supabase（一个 prod project，所有 client 共用）
- **Admin/control writes**：`apps/api`（Hono + service-role，服务端重操作）
- **User app**：`myclaw-aios` SPA（多 shell 共享）
- **Runtime**：per-claw Caddy + OpenClaw（不动）

---

## Tauri 2 vs Electron — 桌面 shell 选型

myclaw-desk 现状是 Electron 39。下面是是否换 Tauri 2 的决策依据。

| 维度 | Electron 39 | Tauri 2 |
|---|---|---|
| 安装包大小 | 80–150MB | 5–15MB |
| 空闲内存 | 150–300MB | 50–100MB |
| Runtime | 自带 Chromium + Node | 系统 webview + Rust shell |
| 跨平台一致性 | 像素级一致（同 Chromium） | webview 因 OS 而异（Win=WebView2 / Mac=WKWebView / Linux=WebKitGTK） |
| 自动更新 | electron-updater 成熟 | tauri-plugin-updater 可用 |
| 移动支持 | 无 | Tauri Mobile（iOS+Android, 2.x GA） |
| 安全默认 | 宽松，需手动收紧 | 紧（capability allowlist 默认） |
| 启动速度 | 中 | 快 |
| Rust 学习成本 | 不需要 | 需要 shell 侧少量 Rust |

**决定性因素：**

1. AIOS 定位是"账号跟着用户走"的**消费品**，不是 devtool。包体积 5× 小 + 内存 3× 低，对获客转化是真金白银。
2. **myclaw-desk 的 Electron 沉没成本被高估**：里面没有 AIOS UI，只有 shell（bootstrap + preload IPC + spawn OpenClaw 子进程 + auto-updater + window 管理）。换 shell ≈ 3–7 天，不是"重写桌面 app"。
3. **AIOS 还没接入 desktop**。若保留 Electron，Phase 8 把 AIOS 跟 Electron preload 接好后再换 Tauri，得重接一次。**切换的最佳时机 = Phase 8（AIOS 集成前完成 shell 切换）**。
4. **未来移动路径**："Windows 账号"叙事到 phone 上自然延伸。Tauri Mobile 是真实选项，Electron 没有移动路径。即使现在不做移动，留这个口子有价值。
5. shell 干的事都不复杂（spawn child / IPC / window / updater），都是 idiomatic Tauri，不写复杂 native 模块。

**决定：换 Tauri 2，时机锁在 Phase 8。**

**接受的真实风险：**
- macOS notarize workflow 比 Electron 烦（要 Apple Developer + `notarytool` + entitlements.plist，第一次会卡半天）
- WebKitGTK 在 Linux 上某些 CSS（backdrop-filter / 复杂 grid / 字体 fallback）偶尔怪 —— DaisyUI 标准组件基本不踩雷，复杂自定义要测
- Tauri 生态比 Electron 小，搜不到 SO 答案时直接读源码或 GitHub issue
- Tauri 2 capability allowlist 严格 —— 调试时容易"为什么 invoke 不通"，要熟悉 `capabilities/*.json` 配置

**被高估的风险：**
- "Tauri 不成熟" —— 2.x GA（2024）后已被 1Password / Posit / Beeper 等产品级软件采用
- "Rust 太难" —— shell 层就是抄 Tauri 文档 + 装几个 plugin，不写复杂 Rust

### Webview 不一致问题的具体策略

DZ 显式问过这个点，单独展开。三个平台拆开：

| 平台 | Webview | 与 Chromium 差距 | 实际痛度 |
|---|---|---|---|
| Windows | **WebView2 = Chromium** (evergreen, auto-update) | 几乎为零 | 无 |
| macOS | WKWebView (Safari) | 落后部分 edge API；字体走 OS native | 小 |
| Linux | WebKitGTK（依发行版常落后 6–12 月） | 新 CSS 部分缺失 / `backdrop-filter` 性能 / 原生 form controls 表现差异 | **真痛** |

**Linux 是真正的痛点。** Mitigation 四件套：

1. **CSS baseline 锁 Safari 16+**（≈ WebKitGTK 2.38+）—— 不用 bleeding-edge 特性（例：早期 `:has()`、`view-transition`、`field-sizing`、复杂 `subgrid`）
2. **强制 DaisyUI 全样式 form controls** —— 不用 OS-native `<select>` / `<input type="date">` 等，sidestep 平台一致性的 80%
3. **Playwright cross-webview CI**：每次 release 跑 Chromium（代表 WebView2）+ WebKit（代表 WKWebView / WebKitGTK）两套 e2e
4. **Linux 第一年列为 "best effort"**：v1 主推 Win/Mac，Linux 文档里明确写 known caveats，预算 bug-fix 但不阻塞发版

**触发重审此决策的红线：**
- 实际用户里 Linux 占比 >30%（受众变成 devtool 而非消费品）
- AIOS 设计上必须用 Chromium-only API（高级 WebRTC 特性、某些 Service Worker 模式、某些专有 codec）

任一条件触发时，回到这个章节重评 Electron。

---

## 几个对你的 plan 的**建设性意见**

DZ 显式要的"对顶层设计的建设性意见"，按重要度排：

### 1. SPA 直读 Supabase，**不要把 apps/api 横插在读路径上**
诱惑很大 —— "干净的 BFF"。**抵制**。规则：
- **SPA → Supabase 直读**（anon key + RLS 保护），读 `claws`, `user_preferences`, `notifications` 等
- **SPA → apps/api**：只走需要 service-role 的写操作（开 claw / Polar webhook 触发 / 管理操作 / 邮件）
- 文档化这条边界，否则会再造一遍刚逃离的 BFF 臃肿

### 2. Edge Function vs apps/api 的边界必须写明
两个会重叠。我推荐的规则：
- **Edge Function**：面向 SPA、短小、无状态、对延迟敏感（token 铸造、presence 检查、轻验证）
- **apps/api**：触碰 Polar、发邮件、调云 API 开 VM、跑超过 5s、需要 admin 角色的事

在 `~/myclaw/CONVENTIONS.md` 里写下来，AIOS 开工前定。

### 3. 标准仓 + 多 shell 嵌入的**版本漂移**是头号杀手
Standalone repo 配桌面 shell（Tauri / Electron 通用问题）最先坏的地方：桌面装的 AIOS 是旧的，web 是新的，同一 bug 在不同 client 表现不一样，调试时疯掉。

应对：
- AIOS 用 commit SHA 钉版本进 myclaw-desk（不要 `main`，要明确 SHA 或 tag）
- AIOS 启动时把 SHA 打到 console + 显示在"关于"页（support ticket 里能看到）
- CI 上 AIOS 出 release-tag 时，自动开 myclaw-desk PR bump 该 tag

### 4. 把"用户↔claw" backfill **提前到 Phase 4 之前**
cool-brook 现在以基础设施身份存在，没有 `user_id` 绑定。AIOS 上线前必须：
- 决定 cool-brook 归谁（DZ 自己的 user_id）
- 把现有 claws 全部 backfill 进 `claws` 表正确的 owner_id
- 否则"登 AIOS"显示空 claw 列表，根本进不去

### 5. 一个 prod Supabase project 不够 —— **现在就开 dev project**
单 Supabase project 边开发边改 schema = 随时炸生产。开个 `myclaw-dev` Supabase project：
- AIOS dev 拉 dev project 的 schema 生成 types
- Migration 先在 dev 跑，验证后再 promote 到 prod

Supabase 免费档够用，开 dev project 没有成本。

### 6. `apps/web` 这个含糊位置是味道（smell）
3 个 app 在 monorepo 里有 1 个"不太确定" = 维护噩梦。在 Phase 2 中替它定位：
- 候选 A：marketing / landing 站（myclaw.one 主站），AIOS 是另一个 app
- 候选 B：account / billing / 设备管理后台（用户登录后处理订阅、设备列表），独立于 AIOS
- 候选 C：删掉

我倾向 B —— marketing 可以静态化部署到别处（Webflow / Notion / Vercel 简单静态），`apps/web` 专做 "登录后的账号自服务"。但**这是 DZ 要做的产品决策，不是技术决策**。

### 7. 不要尝试 Day-1 offline-first
offline 很难。先把 online 状态 auth + claw-connect 跑稳，再加"优雅 offline"（cached read + queued writes）。提早做 offline 会让一切复杂化。

### 8. `*.myclaw.one` 通配 DNS + ACME = Phase 5 的隐藏前置
每开一个新 claw 都要 `<claw-id>.myclaw.one` 立即可解析 + TLS 自动签发。Caddy 的 on-demand TLS 能做但配置容易踩坑：
- 通配证书 vs 按需签发的取舍
- DNS provider API 凭证（Cloudflare? Lightsail 自带？）
- Rate limit on Let's Encrypt

用 cool-brook 当 pilot 跑通这一整套，再大规模开 claw。

### 9. Tauri 2 的几个坑要在 Phase 8 演练
- **macOS notarize**：Apple Developer account + `notarytool` + `entitlements.plist` 三件套，第一次踩坑半天，第二次熟练
- **WebKitGTK on Linux**：某些 CSS / 字体表现和 Chromium 不同 —— DaisyUI 基础组件不踩雷，复杂自定义 CSS 要测
- **Capability allowlist** (`src-tauri/capabilities/*.json`)：所有 invoke 命令、fs / shell / dialog 操作都白名单；调试时第一反应"为什么 invoke 不通"通常是这里漏配
- **Secure storage**：Supabase session 用 `tauri-plugin-stronghold` 或 OS keyring（macOS Keychain / Windows Credential Manager / Linux Secret Service），不要 raw localStorage
- **CSP** in `tauri.conf.json`：写紧，禁掉 inline style/script，否则 XSS 有空间

---

## ~/myclaw-aios 仓结构

```
myclaw-aios/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx                       # entrypoint
│   ├── shell/                         # 多 shell 抽象
│   │   ├── index.ts                   # detectShell() / useShellCapability()
│   │   ├── web.ts                     # 浏览器 shell：无原生能力
│   │   └── tauri.ts                   # 通过 @tauri-apps/api invoke 调用 Rust 命令
│   ├── auth/                          # Supabase Auth UI + session 管理
│   ├── claws/                         # claw 选择器、连接生命周期
│   ├── gateway/                       # WS client + reconnect + RPC
│   ├── features/                      # AIOS surfaces（agents/chat/jobs/launcher/notifications）
│   ├── lib/
│   │   ├── supabase.ts                # anon client
│   │   ├── api.ts                     # apps/api typed client（zod schemas）
│   │   └── db-types.ts                # ← supabase gen types 产物
│   └── components/                    # 业务组件；DaisyUI 是 Tailwind 插件，无 components/ui 目录
├── scripts/
│   └── gen-types.ts                   # CI 跑 supabase gen types --project-id ... > src/lib/db-types.ts
└── README.md
```

**锁定技术栈：**
- Vite 6 + React 19 + TypeScript
- TanStack Router + TanStack Query
- Zustand
- **DaisyUI + Tailwind v4** — DaisyUI 作为 Tailwind 插件加载；选定一套主题（建议 dark-first，可选 light）；它走"class-name 即组件"路线，没有 `components.json` 这种配置约定，加 `daisyui` 进 `tailwind.config` 就行
- **cmdk**（Vercel）补 Cmd+K launcher / command palette — DaisyUI 没这个原语，AIOS launcher 必备
- 必要时按需加 `@floating-ui/react`（精确定位的浮窗）或 `react-aria-components`（accessibility-critical 的下拉/弹层）—— 不预先全装，遇到 DaisyUI 不够用的场景再补
- `@supabase/supabase-js`（anon key）
- 原生 WebSocket + 自写薄 reconnect adapter（拒 socket.io）
- react-hook-form + zod, sonner, Sentry (prod only)
- 同代码在 `app.myclaw.one`（Vercel 静态）和 `myclaw-desk`（Tauri 2 webview）跑

**myclaw-desk 怎么消费 AIOS：**
推荐 **git submodule**（开发期快迭代）→ 稳定后切 **CI artifact**（AIOS 发版自动出 dist，myclaw-desk 构建时拉 tag 化版本）。

---

## Supabase 共享类型策略

锁定：**AIOS CI 调 `supabase gen types typescript --project-id <id> > src/lib/db-types.ts`**。

原因：
- 不需要发包
- 不需要 submodule
- 单一真相源是 prod DB schema 本身
- 改 schema → 重跑 gen → AIOS 类型自动跟上
- API contract 的 zod schemas 在 `~/myclaw/apps/api` 里定义，AIOS 通过 git submodule 或最简单的 copy-on-build 同步

---

## Schema 缺口（在现有基础上加）

现有覆盖：`users`, `claws`, `activation_codes`, `referrals`, `install_reports` 等。

需要补的 migrations：

```sql
-- user_preferences: UI 偏好（主题、上次选 claw、侧栏布局……）
CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- devices: 设备列表（"在所有设备上注销我"、设备管理 UX）
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('web','desktop','mobile')),
  label text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- notifications: 跨设备通知收件箱
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- claw_grants (后期，sharing): 跨用户授予 claw 访问
CREATE TABLE public.claw_grants (
  claw_id uuid NOT NULL REFERENCES public.claws(id) ON DELETE CASCADE,
  granted_to uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer','editor','owner')),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claw_id, granted_to)
);
```

需要先看现有 `claws` 表已有哪些列再决定：
- 是否已有 `endpoint` / `kind`（cloud / local / shared）/ `token_enc`？如果没有，加。
- 是否已有 token 存储？如果是 `claws.gateway_token` 明文 → 强烈建议改加密 + 走 Edge Function 短期化

**永远不要放进 Supabase：**
- agent runtime state / chat messages / jobs / message history —— OpenClaw 持有，不镜像
- window 位置 / scroll 位置 / 临时 UI state —— localStorage 或 `tauri-plugin-store`
- desktop local claws —— 用 `kind='local' + device_id` 标记，RLS 让它只在自己设备可见

---

## Auth & token flow

1. 用户启动 AIOS（任意 shell）
2. Supabase Auth：magic link / OAuth → 拿到 user JWT
3. AIOS 查 `claws` 表（RLS 自动过滤到自己拥有 + 被授予的）
4. 用户选一个 claw
5. AIOS 调 Edge Function `mint_claw_token(claw_id)`：
   - 校验 JWT 有该 claw 访问权
   - 从 DB 取 encrypted gateway token，解密
   - 签发短期（~1h）token 返回 SPA
6. AIOS 打 WS 到 `wss://<claw-id>.myclaw.one/ws`（cloud）或 `ws://localhost:18789`（desktop 内置）
7. **短期 token 只在 SPA 内存活**。刷新页面要重新换。Long-lived gateway token 永不进浏览器。

Session 持久化：
- Web：Supabase session 默认 localStorage（仅 JWT，不含 gateway token）
- Desktop (Tauri 2)：Supabase session 走 `tauri-plugin-stronghold` 或 OS keyring（macOS Keychain / Windows Credential Manager / Linux Secret Service），不用 raw localStorage

---

## 数据边界（中央 vs 设备本地）

| 数据 | 位置 | 同步语义 |
|---|---|---|
| 用户身份、订阅、设备列表 | Supabase | 中央 |
| `claws` 列表（cloud + shared） | Supabase | 中央 |
| UI 偏好（主题、侧栏、最近选的 claw 名） | Supabase `user_preferences` | 中央，eventual |
| Window 位置 / 字体缩放 / 滚动位置 | `tauri-plugin-store` / localStorage | 设备本地 |
| Gateway 短期 token | SPA 内存 | 不持久化 |
| Agent 状态 / 消息 / 任务 | OpenClaw 各 claw 自己持有 | 不进中央 |
| 桌面 local claws | `claws.kind='local'` + `device_id`，仅该设备可见 | 中央 metadata，运行时本地 |

---

## Phase 计划（硬切节奏）

**重要前提**：只有 Phase 0（已完成）和 Phase 1（UX 原型）是**硬承诺**。Phase 1.5 后会**根据原型期间的发现重写 Phase 2-11**。下表的 Phase 2-11 是 v0 best guess，**未锁定**。原型会发现什么 schema 字段必要 / 哪个 surface 实际不需要 / 哪个数据模型需要多一维，那些发现会改这个 plan。

| Phase | 目标 | 触及 | 锁定状态 |
|---|---|---|---|
| **0** | 收尾 myclaw-studio rename + commit + memory（**已完成**） | myclaw-studio | ✅ 锁 |
| **1** | **UX 原型 + DZ 验收 gate**（详见下文专门章节） | `~/myclaw-aios`（新建为原型仓） | ✅ 锁 |
| **1.5** | **Replan**：基于 Phase 1 的发现重写 Phase 2-11；更新 schema 设计 / surface scope / 估时；产出 v1 plan 文档 | plan 本身 | ✅ 锁（流程） |
| **2** | 开 `myclaw-dev` Supabase project；基于已验收的 UX 设计 schema；决定 `apps/web` 角色；写 `CONVENTIONS.md`（Edge Function vs apps/api 边界） | `~/myclaw` | ⏳ tentative |
| **3** | 写新 migrations（基于 Phase 1.5 后定的 schema）；扩展 `claws` 表；定义 RLS policies | `~/myclaw/supabase/migrations/` | ⏳ tentative |
| **4** | Edge Function `mint_claw_token`；apps/api 增加 `register_claw` / `claim_claw` endpoint；**backfill cool-brook 等现有 claws 到对应 user_id** | `~/myclaw` | ⏳ tentative |
| **5** | cool-brook Caddyfile 加 `/ws` 反代；验证外网 WS + token 鉴权打通；**SSH tunnel 从此过时** | cool-brook VM + 标准 claw image | ⏳ tentative |
| **6** | 把已验收的原型从 mock-data 转产品：接 Supabase（auth + claws + prefs）+ 接 gateway WS（实时 agent / message / job 数据）；replace mocks with TanStack Query | `~/myclaw-aios` | ⏳ tentative |
| **7** | 部署 AIOS 到 `app.myclaw.one`（Vercel）；端到端 prod 测试 against cool-brook；Playwright cross-webview CI 跑通 | Vercel + DNS | ⏳ tentative |
| **8** | **myclaw-desk shell 从 Electron 切到 Tauri 2** | `~/myclaw-desk` | ⏳ tentative |
| **9** | AIOS 接入 Tauri shell | `~/myclaw-desk` + `~/myclaw-aios` | ⏳ tentative |
| **10** | 归档 `~/myclaw-studio`（README 指向 aios） | git/repo | ⏳ tentative |
| **11+** | AIOS features 迭代 & 落 forward-compat 部分 | `~/myclaw-aios` | ⏳ tentative |

---

## Phase 1 关键 UX 原则：lay user, 不是 power user

**这条 constraint 覆盖前面所有 surface 描述。** 与之冲突时，本节优先。

**Target user = 不懂技术的普通人**，不是开发者 / power user / "玩转 OS 的人"。这条原则改变 Phase 1 原型每一个 surface 的设计。

**参考对象：**
- ✅ **学**：ChatGPT app / Pi (Inflection) / Notion AI / Apple Intelligence / Replika — 简单、友好、无术语
- ❌ **不学**：Cursor / Linear / Raycast / VS Code / Linux 桌面 — 这些都是 power user 工具

**具体设计 rules：**

1. **不暴露内部术语**：UI 上不说 "Intent" / "Agent" / "Orchestrator" / "Skill"。说 "项目" / "助手" / "对话"，或让用户自己起名。数据模型层面叫 Intent 可以，UI 层面不叫。
2. **不密集信息**：power user 喜欢 dashboard / 多列表 / 高密度。lay user 看见会逃跑。每个 surface 一件主要事，大卡片、清晰层级、留白。
3. **无 CLI / terminal / monospace 美学**：哪怕 "AIOS" 听起来 geek，UI 必须像 consumer app，不像运维工具。
4. **没有 keyboard-only 功能**：Cmd+K launcher 可以有，但**同时必须有可见导航按钮**。Power user 走 Cmd+K，lay user 走鼠标。
5. **错误友好**："抱歉，我没找到，要不要试试 X？" 不是 "Error 500 / Connection refused"。
6. **空状态有引导**：第一次进入显示"试试让助手帮我..."，不是空白页。
7. **配置藏起来**：sane defaults。Settings 不在主导航第一层。Advanced 折叠在"高级 / 开发者模式"下。
8. **声音 / 自然语言优先**（mobile 必须）。Lay user 不打命令。
9. **大按钮、大字体、大点击区**。哪怕 desktop 上也是。
10. **新手引导**：onboarding 不假设技术背景。第一次进 AIOS：欢迎 + "你想做什么"选项 + 引导到第一个 Intent。

**Phase 1 surface 重新分级**（基于 lay user 标准重审 Ultraplan 的 7 个 surface）：

| Surface | 旧分级 | 新分级 | 调整说明 |
|---|---|---|---|
| Intent home (3-pane chat/outline/artifacts) | v1 | **v1** | "outline" 极简化或默认折叠；"artifacts" UI 上叫 "文件"；主对话像 ChatGPT |
| Intent list | v1 | **v1** | 卡片式，不是 Linear table；大封面 / 颜色 / emoji，不是密集行 |
| Cmd+K Launcher | v1 | **v1（但有可见 fallback）** | 默认隐藏，搜索按钮在头部明显处；power user 也能用快捷键 |
| Now panel ("Activity Monitor") | v1 | **v1.5** | "Activity Monitor" 是黑话；如果 v1 需要，改成"正在为你做的事" + 通知图标 inline 在 Intent 卡片上 |
| Schedule view (cron timeline) | v1 | **v2** | cron 是 power user 概念；lay user 用自然语言 "每周一提醒"，UI 在 Intent 内 inline 实现 |
| Memory page | v1 | **v1.5** | 改叫 "助手记得的事"，简化为读+清除，不暴露 structured facts schema |
| Permissions page | v1 | **v1.5** | 改叫 "助手能做什么"，每个 capability 一行简单中文 + on/off toggle |

**结果：Phase 1 原型只 build 3 个 surface**（Intent home + Intent list + Cmd+K Launcher with visible fallback），不是 Ultraplan 写的 7 个。v1.5 / v2 surfaces 等 Phase 1 验收后按需开。**原型 build 时间从 3-5 天 → 2-3 天。**

**"AIOS" 品牌叙事如何在 lay-user UI 里体现：**
- ❌ 不通过画 OS 桌面体现
- ❌ 不通过暴露 process list / cron / permission matrix 体现
- ✅ 通过**让用户感觉"它在为我做事"**体现 —— 后台执行 + 主动友好通知 + "你不在的时候助手帮你..."
- ✅ 通过"一句话告诉 AIOS 你想做什么 → AIOS 想出怎么做"的对话流体现
- ✅ 通过让用户**不需要知道有多个 agent 在协作**体现（agent-to-agent 在底层发生，UI 上只显示一个助手）

---

## Phase 1 — UX 原型 + DZ 验收 gate（详）

**为什么放在最前面：**
- UX 决定 schema（Intent 表要哪些字段？Now panel 怎么显示 running tasks 决定 `agent_traces` 表结构）—— 先做 UX 才能正确建模
- Schema 改造在没数据时近乎免费，有数据后很贵 —— 现在 backfill cool-brook 之前是窗口期
- IA scope 提前定（7 个 surfaces 哪些 v1 必备、哪些延后）
- 顺带验证 Tauri webview 决策（同 dist 跑进 web + Tauri 双壳，提前发现一致性问题）

**原型形态（不做 Figma）：**

- **Stack**：Vite + React + DaisyUI + Tailwind v4 + cmdk + react-resizable-panels + TanStack Router + Zustand —— **最终生产栈**
- **数据**：全 mock，hardcoded fake intents / agents / messages / artifacts，所有交互都假装可用
- **Auth**：跳过登录，直接 logged-in state（mock user）
- **后端**：无。零 Supabase / WS / OpenClaw 接线
- **Surfaces**：**3 个 v1 surface**（基于上节 lay user UX 原则降级后）：
  1. **Intent home** —— 3-pane（主对话像 ChatGPT / outline 默认折叠 / 文件 tab），无术语暴露
  2. **Intent list** —— 卡片式（大封面 + emoji + 颜色），不是密集行
  3. **Cmd+K Launcher with visible fallback** —— 头部明显搜索按钮 + 快捷键
- **部署**：本地 `pnpm dev` + 顺手 Vercel preview link 方便分享

**好处：**
- DZ 评审过的原型**直接变 v1 scaffold**（Phase 6 把 mock 换成真数据，零废弃代码）
- 单 dev **2-3 天**能做出来（v1 缩到 3 个 surface 后）
- 同 dist 跑进 Tauri webview，验证 cross-platform 视觉一致性
- 截图 / 录屏 / 截 GIF 进 `aios-design.md`，定型 UX spec

**验收节奏：**

1. 每个 surface 完成后**单独 review**（Intent home → Intent list → Now → Launcher → Schedule → Memory → Permissions），DZ 给反馈，迭代
2. 全部 review 完毕后，**整体 sign-off**：标记每个 surface 是 v1 / v1.5 / v2
3. 锁定 IA + 视觉方向，写入 `aios-design.md` 的 UI 章节
4. **`approved` 字样进 commit message，Phase 2 才能开始**

**输出物：**
- 可点击原型（部署一份 Vercel preview）
- 锁定的 UX spec doc（PNG 截图 + 注释，进 `~/myclaw/docs/aios-ui-spec.md`）
- v1 / v1.5 / v2 surface 分级列表
- **Phase 1 学习记录**（`~/myclaw/docs/aios-phase1-learnings.md`）—— 原型期间发现的：
  - 实际需要 / 不需要的 schema 字段
  - 数据模型缺漏（"这个 surface 暴露了 X 概念，但 schema 没建模"）
  - Surface scope 调整建议（哪些 v1 不必、哪些 v2 必须）
  - Cross-webview 一致性实测结果（在 web / Tauri 跑了哪些 surface，哪里炸了）
  - 时间估算的修正（哪些 phase 比 v0 预估更快 / 更慢）
- **这些发现进 Phase 1.5 的 replan 输入**

**这个 phase 的范围里 NOT included：**
- 任何 Supabase schema 变更
- 任何 cool-brook infra 变更
- 任何 myclaw-desk shell 变更
- 任何真实数据接线

**原型作为 v1 scaffold 的复用率预估：**
- 视觉层（DaisyUI 用法 / Tailwind v4 主题 / 布局组件）：~95% 直接复用
- 状态管理 / 路由：~80% 直接复用
- Mock 数据层：100% 删，换 TanStack Query + Supabase / WS
- 业务逻辑：~30%（原型只是占位的 stub，真实逻辑要补）

---

## 关键文件 / 路径

- `~/myclaw/supabase/migrations/20260504000001_initial_schema.sql` — 现有 schema，新 migration 在它之上叠
- `~/myclaw/supabase/migrations/<new>_user_preferences.sql` 等 — Phase 3 新增
- `~/myclaw/apps/api/src/` — 扩展，不重写
- `~/myclaw/apps/web/` — 用途待 Phase 2 决断
- `~/myclaw/CONVENTIONS.md` — 新建，Edge Function vs apps/api 边界
- `~/.openclaw/credentials/myclaw-supabase.env` — 已有，复用
- `~/myclaw-aios/` — 新建（Phase 1 原型仓，Phase 6 转产品）
- `~/myclaw-desk/` — Phase 8 重写为 Tauri 2 shell；Phase 9 接入 AIOS
- cool-brook 上的 `/etc/caddy/Caddyfile` — Phase 5 加 `/ws` 反代

---

## Verification

每个 phase 后的端到端验证步骤：

- **Phase 1 后（UX 验收 gate）**：3 个 v1 surface 各一份 Vercel preview link（Intent home / Intent list / Cmd+K + visible fallback）；DZ 用 **lay-user 视角**（非技术亲友测试更佳）走一遍 → sign-off + v1.5 / v2 surface backlog；`aios-ui-spec.md` 写入 `~/myclaw/docs/`；commit message 含 `approved` 字样。无此 sign-off，Phase 2 不开工。
- **Phase 3 后**：psql 连 dev Supabase，`\d+` 看新表 + `select * from pg_policies` 看 RLS。
- **Phase 4 后**：curl Edge Function 带有效 JWT，拿到短期 token；用 token 走 WS 连 cool-brook 成功（暂走 SSH tunnel）。
- **Phase 5 后**：本地 curl `https://96tdd65c.myclaw.one/ws`，HTTP 101 + `connect.challenge` 事件返回（之前用 SSH tunnel 时验过同样的 probe，这次走公网 TLS）。dev workflow 的 SSH tunnel 可以下线。
- **Phase 6 后**：`pnpm dev` in `~/myclaw-aios`，登录跑通，claw picker 显示 cool-brook，点开 WS 连接，"connected" 标示亮；7 个 surface 全部从 mock 切到真数据，UX 行为与 Phase 1 验收过的原型一致。
- **Phase 7 后**：访问 `https://app.myclaw.one`，登录，连 cool-brook，最小 agent 操作端到端跑通。
- **Phase 8 后**：myclaw-desk 切到 Tauri 2 跑通：`pnpm tauri dev` 启动；child_process 能正确 spawn OpenClaw gateway；auto-update channel 配通（dry-run）；webview stub 加载占位页面成功；CSP / capability allowlist 通过基本验证；**Playwright cross-webview CI 跑通 Chromium + WebKit 两套 baseline** —— 这是 Tauri 决策的测试义务（见上）
- **Phase 9 后**：AIOS 接入完成；同样的登录流程在 Tauri shell 里跑通；web 端登录后，desktop 端自动看见同样的 claw 列表（Supabase 数据同步）

---

## Open items / 必须先答的问题

- **`apps/web` 角色**：阻塞 Phase 2。Marketing? Account self-serve? 删掉？必须先决定。
- **`claws` 表现有列结构**：要读完整的 `20260504000001_initial_schema.sql` 才能确定 `endpoint`, `kind`, `token_enc` 哪些已有哪些要加。Phase 3 第一件事。
- **Gateway token 加密策略**：Supabase Vault? `pgcrypto` + app-managed key? KMS via apps/api? Phase 4 之前定。
- **`*.myclaw.one` 通配证书 + 自动 provision** 现在怎么做的？有现成 pattern 还是要先搭？Phase 5 前查清。
- **Local claws 跨设备建模**（desktop-local claws 在 phone 上怎么呈现？灰显？隐藏？）：Phase 1 UX 原型期间出子 design doc，Phase 3 schema 落实之前敲定。

---

## 未来 AIOS 的前瞻 + v1 forward-compat checklist

DZ 在 `~/myclaw/docs/aios-design.md`（2026-05-06 draft）里定义的 vision 已经对齐未来 3-5 年趋势的核心方向（Intent-first、sovereignty split、role-keyed URL 分离、multi-substrate）。下面是基于此 vision 的**前瞻分析** —— 7 个未来必备的结构性能力，v1 不必实现，但**数据模型和接口必须预留扩展位**。

### 1. Multi-agent orchestration > @-mention
- 现 vision：`@agent-key` 内联 + dedicated subchat
- 未来：agent calls agent / 结构化消息（不只 chat text）/ 回溯+分支 / 观察 vs 委托模式
- **v1 预留**：Intent 数据模型里独立 `agent_calls` / `agent_traces` 表，不要把 agent 输出 hard-code 嵌进 chat messages

### 2. Background / autonomous execution 是一等公民
- 现 vision：几乎没提"agent 在用户离线时工作"
- 未来：cron-triggered / event-triggered / long-running (hours/days) intents 是 AIOS 与 chat 工具的核心区别
- **v1 预留**：Intent 表加 `trigger` (manual/cron/event/webhook) + `lifecycle` (pinned/active/dormant/archived)；UI 加 "Now" surface (OS 隐喻里的 Activity Monitor)

### 3. Cross-Intent memory
- 现 vision：每个 Intent 自己的 chat = 它的 memory
- 未来：user-level memory facts 跨 Intent 共享（"日本之旅学的 visa 知识，韩国之旅自动复用"）
- **v1 预留**：Supabase schema 加 `user_memory_facts` (结构化) + `intent_memory_refs`（引用关系）；UI 可暂不暴露

### 4. Permission / capability model — day 1 必有
- 现 vision：无 agent capability / permission 概念
- 未来：mobile-app-style — "这个 agent 可读日历不可读邮件 / 调 Stripe 需每次确认 / agent-to-agent 权限"
- **v1 预留**：`agent_capabilities` (agent_id, capability_kind, granted_at, scope) 表；v1 可只显示不让改，但表结构必有
- **痛点警告**：事后加 permission 比加 i18n 还痛 —— 影响每一次 agent 行为，无法事后包一层

### 5. Mobile = v1.5 而非 v3
- 现 vision：web + desktop only
- 未来：approve / quick chat / status query 大量发生在移动端；中国 / 印度 mobile-only 用户基数大
- **v1 预留**：API / realtime channel 设计假设 mobile 是 first-class，AIOS UI 用 responsive 而非 desktop-only

### 6. Federation hooks
- 现 vision：单一 myclaw 闭环
- 未来：5 年内 AIOS federation 协议会出现（类似 ActivityPub for AI agents）
- **v1 预留**：API 不假设"我的 AIOS 是唯一上下文"；triple-token 模型已经有正确味道，保留

### 7. Multi-modal 进数据模型
- 现 vision：messages 大概率 text-first
- 未来：mobile 默认语音 / 屏幕分享 / image input / agent 产出 video/audio
- **v1 预留**：`messages.content` 设计为 `jsonb`，不假设 string；Artifact pane 支持 inline media preview

---

### 对 GUI 设计的最终意见（基于 aios-design.md）

DZ vision 里 Intent 是顶层抽象 → 用户认知应花在 Intent 上，不在窗口管理上 → **不做 puter desktop，不做浮动窗口 webos**，做 **IDE/workspace shape**。AIOS 品牌通过 launcher / activity monitor / permissions / memory 这些 OS 化概念体现，不通过画桌面体现。

| Surface | 作用 | OS 隐喻对应 |
|---|---|---|
| `/aios/:claw/:intent` (3-pane) | Intent home（chat / outline / artifacts），vision 已有 | "App 窗口" |
| `/aios/:claw` (Intent list) | Linear-style 所有 Intent inbox | "Application 列表" |
| **Now panel** (全局) | 背景任务 / approvals pending / running tasks | "Activity Monitor" |
| **Cmd+K Launcher** | 跨 Intent / 跨 claw 搜索 + jump | "Spotlight" |
| **Schedule view** | 时间轴可视化 cron / triggered intents | "Calendar / Cron" |
| **Memory page** | user memory facts 浏览/编辑 | "用户档案" |
| **Permissions page** | per-Intent agent capability 管理 | "系统偏好 / Privacy" |

技术栈和之前一致：Vite + React + DaisyUI + Tailwind v4 + cmdk + react-resizable-panels + TanStack Router/Query + Zustand。

**关键决策**：放弃 puter fork（90% 代码无关）+ 放弃自建浮动窗口 webos（用户已不期待这种范式），走 IDE/workspace shape。

---

## 跟现有 memory 的关系

本 plan **修正**了 [[aios-architecture-plan]] memory 中的几点：
1. 之前误以为 Supabase 是空中楼阁要从零搭 —— 实际上 `~/myclaw` 已经有完整的 Hono apps/api + 13 张表的 schema 在跑。
2. 之前推荐 Tauri，然后 Explore 发现 myclaw-desk 实际是 Electron 39。**本 plan 经过权衡后决定主动切回 Tauri 2**，时机锁在 Phase 8（AIOS 集成入桌面之前）。理由见 "Tauri 2 vs Electron — 桌面 shell 选型" 节。
3. 之前把 L2 描述为"只有 Supabase + Edge Functions" —— 实际 L2 包含 Edge Functions + apps/api 两个 server-side 组件，边界要明确（见上文 critique #2）。
4. 仓位置从"monorepo 内 apps/aios"改为"独立仓 `~/myclaw-aios`"（用户决定）。

执行 Phase 1 之前，应该更新 [[aios-architecture-plan]] memory 记录这些修正。

[[openclaw-untouched]] 约束依旧生效，没变。
[[dev-workflow-cool-brook]] 在 Phase 5 完成后整体过时。
