# 门店增长智能体 · 本地整合版

本地分支 `codex/local-integration` 合并输入理解模块与输出交付包，保留 ima → DeepSeek 主链路。未推送 GitHub，未更新魔搭。上游试用说明保存在 `docs/scenario-trial-README.md`，其中旧验证结论不代表本版本。

## 本机打开

入口：http://127.0.0.1:8791/scenario/ 。点击“查看上次生成方案”可直接查看已生成的三平台结果；新任务按“填写场景 → 理解 → 核对确认 → 选择产品 → 生成”操作。原服务仍在 8787，独立运行。

**当前默认直接读取本地资料包 `华为PC知识库(2).zip`，不调用 ima。** 已导入 10 个产品、68 张有产品索引的图片；保留原始目录和内容哈希。校园学习 + 小红书的真实 DeepSeek 联调已通过，最终交付完整文案（含图片）与约 3 分钟店员脚本。

用户只需提供一段完整场景，需求维度由系统提取；理解与确认可折叠，关键冲突会展开提示。客户需求与产品选择分别确认，避免自动补造事实。发布场景和渠道为单选，本轮仅开放校园学习、小红书。

## 安装和启动

需要 Node.js 24、pnpm 11.25.0。在本目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

本机启动命令（8791 已运行时无需重复启动）：

```powershell
.\scripts\start-local.ps1 -EnvFile ..\.env.local
```

默认 `KNOWLEDGE_SOURCE=local`，读取项目 `knowledge/`。本机 DeepSeek 密钥来自用户环境变量；换机器时将 `.env.example` 复制为 `.env.local`，仅需配置 `DEEPSEEK_API_KEY`，再运行 `scripts/start-local.ps1 -EnvFile .env.local`。不要上传密钥、历史输出或本地依赖。

本地知识库更新：`python scripts/import-local-knowledge.py "新资料包.zip"`。导入工具需要 Python/Pillow；应用运行和 Docker 不需要 Python。保留完整图片索引，导入后运行测试和 `pnpm package:modelscope`。素材缺失或完整型号不明确时提示补充，不从其他型号借图。

## 三人协作和合并规则

| 负责人 | 主要文件 | 对接约定 |
| --- | --- | --- |
| 输入卡同学 | `modules/scenario/src/` 中输入、洞察和审核组件；`modules/scenario/server/`；`modules/scenario/shared/` | 负责场景结构、原文依据、事实/推断/未知与确认门槛。修改共享结构时同时更新服务端校验和测试。 |
| 输出结果同学 | `prompts/system.txt`、`contracts/output.schema.json`；结果展示 `ResultView.jsx` | 模型输出保留下面的八个字段；新增要求先补样例和校验。不要改 ima/DeepSeek 凭证、接口和检索逻辑。 |
| 链路集成负责人 | `src/handoff.mjs`、`src/pipeline.mjs`、`src/shadow-batch.mjs`、`src/scenario-service.mjs`、`server.mjs`，以及 `Handoff.jsx`、`RecentResults.jsx`、部署脚本 | 负责两端适配、流式状态、来源验证、错误处理和部署。公共入口 `main.jsx`、共享 CSS、依赖与锁文件由集成者统一合并。 |

输入卡通过 `src/handoff.mjs` 转为兼容任务：`product/audience/scenario/platform` 必填字符串，`goal/notes` 可选。已确认的结构化洞察作为独立 `customer_context` 传入，不能把推断当成客户原话。

模型输出固定八个字段：`customer_insight`、`strategy`、`content`、`image_plan`、`sales_plan`、`follow_up`、`source_refs`、`pending_confirmation`。具体类型以根目录 `contracts/output.schema.json` 为准。来源编号必须确实存在，正文及图片使用的来源必须与声明一致，跟进天数固定为 1/3/7。

`delivery` 和检索模式属于服务端结果外层，不让模型伪造：`draft` 表示草稿生成，`needs_images` 表示需补图，`blocked` 表示内容不能交付。草稿不等于事实或合规已逐句审核。全平台包继续使用 `schema_version=shadow.1`；原 `/api/run` 保持可用。

`/api/run-scenario` 返回 NDJSON，HTTP 200 只代表开始。前端接收 `platform_result` 逐项展示，最后检查 `result.complete`、`errors` 和 `blocked`；总体检索失败会返回 `error`。不能把“接口返回 200”当成三平台成功。

每人独立分支提交，经集成分支统一构建和测试；不按文件时间覆盖，也不整包替换另一人的目录。`handoffs/output-results/` 保留队友交付记录，运行时读取根目录提示词与 schema。更新交付记录不会自动生效，应由集成者审查后同步。

## 魔搭部署包

运行 `pnpm package:modelscope` 从源码白名单重建 `modelscope-upload/`。这是生成目录，不手改其中副本；只上传其内部文件，Dockerfile 位于魔搭仓库根目录。Node.js 24、多阶段构建 React、监听 `0.0.0.0:7860`。

魔搭必填私密环境变量：`DEEPSEEK_API_KEY`。建议显式填写 `DEEPSEEK_MODEL=deepseek-flash`，Docker 已设置 `KNOWLEDGE_SOURCE=local`、`HOST=0.0.0.0`、`PORT=7860`。上传目录包含知识库文本和图片，不需要 ima 凭证。线上不设置本机的配置或缓存文件路径。

本次只准备部署包，没有上传。Docker 引擎未运行，镜像构建尚未验证。

## 验证与边界

53 项后端测试及前端构建通过；真实 DeepSeek 完成单段校园输入理解、人工确认、小红书文案和店员脚本生成，使用本地资料包 4 张图片。复制、文本导出、图片加载与手机布局通过。生成时锁定上游输入，替换完整输入时清除旧补充，避免客户之间的信息残留。

可复现的界面回归在 `tests/browser/focused-flow.mjs`，使用合成 API 响应，不调用模型。运行需要 Playwright（或用 `PLAYWRIGHT_MODULE` 指定其模块路径）、可选 `CHROME_PATH` 指定浏览器，`LOCAL_APP_URL` 默认为 `http://127.0.0.1:8791`。执行 `node tests/browser/focused-flow.mjs`。

后续添加场景/渠道，先编辑 `modules/scenario/shared/experience.mjs` 的目录并启用选项；对应文案规则在 `prompts/system.txt`，输入确认适配在 `src/handoff.mjs`。后台保留原八字段契约与多平台能力，当前页面每次只请求所选一个渠道。

最新验证见 `docs/focused-local-verification.md`。此前的缓存模式验证记录仅用于历史追溯，不代表当前运行来源。

尚未实现逐句自动事实审核、自动产品推荐或四级报价计算。没有自动发消息。团队演示版无多用户隔离；分析确认记录存在内存，重启后需重新理解。历史结果只恢复展示，不恢复确认权限。
