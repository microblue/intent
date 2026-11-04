# Intent 验证记录

## 2026-11-03（深夜）单文件运行环境上线

- 线上地址：https://intent.microvalley.io 。GCP 免费档 e2-micro（项目 `intent-runtime-1666`，VM `intent-1`，us-west1-b，1GB 内存），Cloudflare 隧道接入，不开入站端口。旧地址 intent-azure.vercel.app 307 跳转到这里。
- 运行的就是单个可执行文件 `intent-linux-x64`（Bun 1.3.1 编译，101MB）。存储是 TinyBase + 内置 SQLite（WAL），数据在 `/var/lib/intent/intent.db`。已删除 Supabase 项目和 Vercel 上的全部环境变量。
- 真实模型冒烟测试（`INTENT_SMOKE_URL=https://intent.microvalley.io`）：诈骗短信、生日祝福都进入 done，两案合计约 29 秒。
- 浏览器验收：线上页面 SSE 实时推送已连上（`/api/events` 返回 text/event-stream），无控制台错误；管理后台登录、统计、用户、请求日志正常。线上实例常驻内存 55–80MB，JS 堆约 5MB。
- `pnpm test:binary`：24 项全部通过（嵌入的界面、深链接、建任务、SSE 推送、注册/错误密码/异地登录、用户隔离、管理员一次性设置链接、错误 token 拒绝、管理接口需登录、SQLite 备份、同目录拒绝第二个进程、退出时释放锁、重启后任务/会话/管理员登录都保留、数据目录不存在时自动创建）。
- Playwright 30 项通过（Node + node:sqlite 路径，fake 模型）。
- 本机空闲内存：Bun 版 RSS 59MB（私有 21MB），Node 版 RSS 62MB（私有 16MB）。
- 修复的问题：Bun 的异步 scrypt 在 e2-micro 上约每 3 次算错 1 次（同一请求时而 200 时而 401，本机无法复现）。改为同步 scrypt 后 VM 上连续 20 次登录全部成功。
- 交叉编译：linux x64/arm64、macOS x64/arm64、Windows x64 都编出来了（59–115MB，gzip 后 22–40MB）。**只有 linux-x64 实际运行和测试过。**

以下两节是更早的记录（当时托管版在 Vercel + Supabase，现已下线）。

## 2026-11-03（晚）线上部署

- 线上地址：https://intent-azure.vercel.app （Vercel 项目 `intent`，生产环境）。
- 托管版存储：Supabase 项目 `intent`（`lpqgyjsqftkctrntglrw`），4 张表开启行级安全、无公开策略，只有服务端密钥能读写。自托管包仍用内置 TinyBase，不依赖外部数据库。
- 真实模型冒烟测试（`INTENT_SMOKE_URL=https://intent-azure.vercel.app node scripts/smoke-real.mjs`）：provider=openrouter，model=meta/muse-spark-1.3，scripted=false。虚构诈骗短信、生日祝福两个案例都生成 result 并进入 done，两案合计约 43 秒。
- 本地用 fake 模型直连 Supabase 存储跑通：建会话、建任务、轮询完成、列表、删除全部数据。
- 字号三档从 20/24/30px 调到 17/20/24px。Playwright 30 项通过（desktop + mobile，fake 模型），包括最小字号 ≥16px、语音按钮高度 ≥60px 的检查。
- 线上没有限流（所有者决定）。

## 2026-11-03（白天）

- TypeScript：浏览器和服务端 noEmit 检查通过。
- 构建：Vite 浏览器构建与服务端构建均通过；浏览器主包约 555 kB，有体积警告。
- Playwright：30 项通过，fake 模型。
- 真实模型：OpenRouter 的 meta/muse-spark-1.3，开发服务和独立构建服务各验证过。
- 凭据检查：Linux 打包白名单中的 57 个文件未包含本机模型 API 密钥原值。该检查不等同于完整开源审计。

## 未验证

Meta 直连凭据与原生搜索、真实支付、后台提醒、跨设备账号恢复、高并发下的托管版表现。

真实模型输出有随机性；30 项确定性测试不能替代真实模型质量评估。
