# Intent 项目上下文

项目根目录：/home/dz/intent。包名：intent。产品名：Intent。

这是面向初次使用 AI 的用户、尤其长辈的日常助手。以 README.md、docs/product/intent-design-spec.md、docs/product/agent-runtime-design.md 和实际源码为准。

## 代码结构

- src/：Vite、React、TypeScript 前端，包含今天、新建任务、任务详情、我的。
- shared/：前后端共享类型。
- server/：模型适配、工具循环、审批规则、会话与账号、TinyBase+SQLite 存储（server/store）、HTTP 服务（http.ts）、管理后台 /_/（admin.ts）、命令行入口（main.ts）。
- e2e/：桌面与手机测试，明确使用 fake 模型。
- docs/submission/：作品说明、演示方案和验证记录。

## 运行与验证

pnpm install --frozen-lockfile；pnpm dev；pnpm build；pnpm start。
单文件可执行程序：pnpm build:binary（--all 出 5 个平台），需要 Bun；pnpm test:binary 端到端验证。
pnpm typecheck；pnpm test:e2e；真实模型测试见 scripts/smoke-real.mjs。
线上实例：GCP e2-micro `intent-1`（项目 intent-runtime-1666），https://intent.microvalley.io，部署方法见 ~/.config/intent/host.md。
如果 pnpm shim 不可用，调用 node_modules/.bin 下对应程序。

Meta 直连使用 MODEL_API_KEY；OpenRouter 使用 OPENROUTER_API_KEY。密钥只在服务端，不能带 VITE_ 前缀或进入 Git。
业务逻辑依赖 ChatProvider / SearchProvider；模型配置集中在 server/deps.ts。
不依赖外部数据库或托管服务：数据在 <数据目录>/intent.db（SQLite），一个数据目录只允许一个进程（intent.pid 锁）。
匿名身份使用服务端签名的 HttpOnly cookie，可选用户名+密码账号（scrypt，必须用同步版本，Bun 的异步 scrypt 在小内存机器上会偶发算错）。
界面保持适老、大字号、中英文和清楚的同意按钮。fake 模式必须明确标记，不能当作真实模型结果。
本版尚无自动支付、持续监控、定时提醒、对外 API 文档或 Agent-to-Agent 接口。
