# Intent 项目上下文

项目根目录：/home/dz/intent。包名：intent。产品名：Intent。

这是面向初次使用 AI 的用户、尤其长辈的日常助手。以 README.md、docs/product/intent-design-spec.md、docs/product/agent-runtime-design.md 和实际源码为准。

## 代码结构

- src/：Vite、React、TypeScript 前端，包含今天、新建任务、任务详情、我的。
- shared/：前后端共享类型。
- server/：模型适配、工具循环、审批规则、签名匿名会话、本地存储和独立 HTTP 服务。
- e2e/：桌面与手机测试，明确使用 fake 模型。
- docs/submission/：作品说明、演示方案和验证记录。

## 运行与验证

pnpm install --frozen-lockfile；pnpm dev；pnpm build；pnpm start。
pnpm typecheck；pnpm test:e2e；真实模型测试见 scripts/smoke-real.mjs。
如果 pnpm shim 不可用，调用 node_modules/.bin 下对应程序。

Meta 直连使用 MODEL_API_KEY；OpenRouter 使用 OPENROUTER_API_KEY。密钥只在服务端，不能带 VITE_ 前缀或进入 Git。
业务逻辑依赖 ChatProvider / SearchProvider；模型配置集中在 server/deps.ts。
匿名身份使用服务端签名的 HttpOnly cookie。当前 JSON 存储仅支持单进程。
界面保持适老、大字号、中英文和清楚的同意按钮。fake 模式必须明确标记，不能当作真实模型结果。
本版尚无自动支付、持续监控、定时提醒、跨设备账号恢复或托管生产数据库。
