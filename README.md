# 有为智选 · 华为 PC 门店增长助手

唯一维护源码位于本仓库根目录。网页入口为 `/scenario/`，`/` 自动转入同一工作台。原始接口 `/api/run` 保留兼容，不再维护第二套表单界面。

输入一段完整需求，系统提取身份与任务，按知识库提出可更换的产品候选，生成完整小红书文案与同型号配图。理解摘要可折叠；未知预算、软件和已有设备不阻止有限草稿，已知冲突必须处理。最终输出不包含建议方向、分时店员脚本或跟进日程。

主要示例覆盖学生小组汇报与职场会议，支持小红书和朋友圈，并补充比赛业务场景。所有示例均为虚构输入，不证明产品能力。职业和场景只用于组织表达，产品功能必须有本轮知识库依据。小红书优先以不同需求匹配不同有据功能，朋友圈聚焦一个核心卖点。

本版包含研究数据库、知识库检索、逐句产品事实核验、配图筛选与可展开的选型依据。部署包自动包含这些运行资料，排除密钥、本地缓存和历史生成结果。`npm run package:modelscope` 生成魔搭 Docker 上传目录，使用 Node.js 24 和端口 7860。

## 本地运行

要求 Node.js 24、pnpm。根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
.\scripts\start-local.ps1 -EnvFile ..\.env.local
```

默认地址 `http://127.0.0.1:8791/scenario/`。换机器时可从 `.env.example` 创建本机环境文件，通过 `-EnvFile` 指定；仅需配置 `DEEPSEEK_API_KEY`。不要提交凭证。现有 8787 原始服务不由本仓库清理脚本管理。

默认 `KNOWLEDGE_SOURCE=local`，使用 `knowledge/` 的原文、索引和图片，不调用 ima。知识库更新命令：`python scripts/import-local-knowledge.py "新资料包.zip"`（导入需要 Python/Pillow；应用运行不需要）。

## 团队对接

| 范围 | 维护文件 | 约定 |
|---|---|---|
| 输入与理解 | `modules/scenario/server/`、`shared/`、`src/main.jsx`、`src/ExamplePicker.jsx` | 事实必须保留逐字原话；推断与未知独立；修订必须重新理解。 |
| 文案与展示 | `prompts/`、`contracts/output.schema.json`、`modules/scenario/src/ResultView.jsx` | 交付完整文章和配图；分析留在内部字段，不输出建议方向。 |
| 集成与部署 | `src/`、`server.mjs`、`modules/scenario/src/Handoff.jsx`、`scripts/` | 统一处理型号限制、来源、流式终态、错误和构建。 |

输出契约保留六个字段：`customer_insight`、`strategy`、`content`、`image_plan`、`source_refs`、`pending_confirmation`。最终复制与文本导出只含完整文案，旧结果中的 `sales_plan`、`follow_up` 不恢复展示。

`/api/run-scenario` 使用 NDJSON；HTTP 200 只表示开始，必须检查最终事件。手动选型与自动候选共用系统限制，服务端也校验，不能绕过。产品候选不等于软件兼容、预算或购买建议已核实。

队友原交付包已移出运行源码；必要样例在 `tests/fixtures/output-results/`，仅用于测试旧输出兼容。新的修改直接提交现行源码，不复制第二套项目。对比与取舍见 `docs/upstream-comparison.md`。

## 验证

```powershell
pnpm test
pnpm build
node tests/browser/focused-flow.mjs
```

浏览器测试需要 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定其模块地址、`CHROME_PATH` 指定 Chrome、`LOCAL_APP_URL` 指定地址。使用合成接口响应，不消耗模型额度。真实 DeepSeek 验证和 Docker 构建需单独注明，不能用离线测试代替。

## 魔搭

`pnpm package:modelscope` 从现行源码生成 `modelscope-upload/`；该目录被 Git 忽略，不手动修改其中副本。上传其内部文件，Dockerfile 位于创空间仓库根目录。Node.js 24，监听 `0.0.0.0:7860`，构建时编译 React。

必填私密环境变量：`DEEPSEEK_API_KEY`。建议设置 `DEEPSEEK_MODEL=deepseek-flash`；Docker 默认 `KNOWLEDGE_SOURCE=local`，无需 ima 凭证。包内包含知识库，排除环境文件、依赖、测试输出与缓存。

## 当前边界

应用检查结构、引用编号、图片所属型号与文件完整性；没有逐句语义事实认证。没有有效配置报价和软件实机兼容测试。图卡编辑、PNG/ZIP 导出尚未接入；目前支持文案复制、文本导出及知识库配图展示。模型每次输出仍需人工复核。

团队演示版未实现多用户隔离。理解与确认保存在内存，重启后需重新理解；历史结果仅恢复展示。没有自动发布或向客户发消息。
