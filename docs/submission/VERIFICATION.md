# Intent 验证记录

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
