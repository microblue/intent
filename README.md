# Intent

面向第一次使用 AI 的人，尤其是长辈的日常助手。用一句话开始，通过追问、计划、结果卡与明确的同意按钮处理事情。支持中文、英文、大字号、浏览器语音输入和朗读。

## 当前可运行版本

- React 前端与 Node 服务端；提供本机单进程启动方式。
- Meta Muse Spark 1.3 工具调用，可通过 Meta Model API 或 OpenRouter 接入。
- 任务时间线、结果卡、个人偏好与可删除记忆通过 TinyBase 保存到实例数据目录。
- 服务端签名匿名会话；跨站请求检查；用户数据隔离。
- 服务端礼品卡等禁做规则、预算复核、审批等待与停止任务。
- 显式 fake 模式仅用于确定性测试，界面显示演示提示；缺密钥不会自动假装联网。

## Linux 独立实例

运行 `npm run package:linux` 生成 `release/intent-linux-x64.tar.gz`（架构取决于构建机器）。包内包含 Node、前端、服务端和 TinyBase；目标机器无需 Node、npm 或 Docker。用 `./intent run /path/to/instance` 启动，支持 start、stop、status。配置和数据独立于应用目录。完整操作和兼容性见 [INSTANCE.md](docs/INSTANCE.md)。

`npm run test:instance` 验证已构建包的目录搬迁、多实例隔离、重启持久化与启动锁。

## 安装和配置

从源码构建需要 Node.js 22 和 pnpm 10。运行 pnpm install --frozen-lockfile。
把 .env.example 的配置加入本机 .env.local，勿覆盖已有凭据。

Meta 直连：INTENT_PROVIDER=meta、MODEL_API_KEY、INTENT_MODEL_MAIN=muse-spark-1.3。
OpenRouter：INTENT_PROVIDER=openrouter、OPENROUTER_API_KEY、INTENT_MODEL_MAIN=meta/muse-spark-1.3、INTENT_MODEL_SEARCH=meta/muse-spark-1.3。

密钥只在服务端使用，不能加 VITE_ 前缀。Meta 直连搜索使用 Responses web_search；OpenRouter 使用其网页搜索插件。搜索失败时不应生成虚构价格或引用。

## 启动

开发：pnpm dev --host 127.0.0.1 --port 5199。
构建：pnpm build。独立启动：pnpm start，默认 http://127.0.0.1:5199。
本机 pnpm shim 不可用时，可直接调用 node_modules/.bin 中的 vite、tsc、playwright。
独立启动的等价命令：node --env-file-if-exists=.env.local dist-server/standalone.js。

INTENT_DATA_FILE 可指定独立数据文件。数据文件旁的 .session-key 用于会话签名，权限为 600；二者都不能上传或提交。备份时同时备份，勿让多个服务进程共用文件。

## 验证

- pnpm typecheck
- pnpm test:e2e：桌面与手机确定性测试，使用假模型，不证明真实模型可用。
- 在独立端口启动真实模型服务后，运行 INTENT_SMOKE_URL=http://127.0.0.1:5198 pnpm test:real。
- 真实模型测试只提交虚构防骗短信和生日祝福，结果写入 test-results/real-model-smoke.json。

## 范围与数据

这是可运行的单机参赛原型，不是完整多租户 SaaS。TinyBase 文件持久化仅支持每实例一个写入进程；尚无跨设备登录、账户恢复、生产数据库、多进程部署或公开服务限流。不要只把 dist 静态目录部署到 Vercel 并称为完整应用，服务端也必须运行。

购买卡是决策辅助，付款由用户在商店完成；“我付好了”是用户自报，不是支付回执。当前不执行付款、下单、发送消息、后台监控或定时提醒。模型分析不能保证识别所有骗局。

浏览器语音能力依赖浏览器支持；真实模型会收到用户输入及当前任务上下文。参赛演示只使用虚构数据。

项目目录为 `/home/dz/intent`，包名为 `intent`，产品名称为 **Intent**。历史原型资料已移出当前项目；当前能力以本文和实际源码为准。

开源许可和旧代码复用资格尚需项目所有者及比赛正式规则确认；本仓库未因此自动获得开源授权。
