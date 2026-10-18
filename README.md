# 门店增长智能体 · 本地整合版

本地分支 `codex/local-integration` 合并输入理解模块与输出交付包，保留 ima → DeepSeek 主链路。未推送 GitHub，未更新魔搭。上游试用说明保存在 `docs/scenario-trial-README.md`，其中旧验证结论不代表本版本。

## 本机打开

入口：http://127.0.0.1:8791/scenario/ 。点击“查看上次生成方案”可直接查看已生成的三平台结果；新任务按“填写场景 → 理解 → 核对确认 → 选择产品 → 生成”操作。原服务仍在 8787，独立运行。

**当前运行的是显式缓存资料模式。** 本次实时 ima 检索返回 `220021: 资料获取次数已达上限，请明天再尝试`。本地已使用此前真实取得的知识库原文和图片，配合真实 DeepSeek，完成三平台生成。页面和 JSON 均标注资料原始日期，不将缓存冒充本次检索。缓存仅适用于资料对应的同一产品。

## 安装和启动

需要 Node.js 24、pnpm 11.25.0。在本目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

本机复用已有外部配置与资料的启动命令（8791 已运行时无需重复启动）：

```powershell
.\scripts\start-local.ps1 -EnvFile ..\.env.local -EvidenceFile ..\output\latest.json
```

额度恢复后，省略 `-EvidenceFile` 即使用实时检索：

```powershell
.\scripts\start-local.ps1 -EnvFile ..\.env.local
```

换机器时，将 `.env.example` 复制为本机 `.env.local`，填写 ima 和 DeepSeek 凭证，再运行 `scripts/start-local.ps1 -EnvFile .env.local`。本机 DeepSeek 密钥来自用户环境变量；不用复制密钥到代码。缓存文件和原图片必须配套，只有 JSON 不足以恢复图片。不要上传凭证、`output/`、`tmp/` 或本地依赖。

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

魔搭私密环境变量：`DEEPSEEK_API_KEY`、`IMA_OPENAPI_CLIENTID`、`IMA_OPENAPI_APIKEY`。建议显式填写 `IMA_KB_NAME=任德耀新建华为PC知识库` 和 `DEEPSEEK_MODEL=deepseek-flash`。线上不设置本机的 `SHADOW_ENV_FILE` 或 `IMA_EVIDENCE_CACHE_FILE` 路径。

本次只准备部署包，没有上传。Docker 引擎未运行，尚未验证镜像构建。线上同步应在实时 ima 全链路补验后进行。

## 验证与边界

46 项测试、前端构建通过；真实 DeepSeek 已完成分析与三平台生成，浏览器验证复制、下载、图片、历史恢复与移动端布局。生成时锁定上游输入，避免结果因中途编辑丢失。详细证据见 `docs/local-integration-verification.md`。

尚未完成实时 ima 重新取数全链路、Docker 镜像构建、逐句事实审核、自动选型和四级报价计算。没有自动发消息。本次小红书结果仅选出两张图，界面标注需补一张；文案品质与长度仍可由输出同学优化。

这是团队演示服务，无多用户隔离；分析确认记录存在内存，重启后需重新理解。历史结果只恢复展示，不恢复确认权限。
