# 华为 PC 营销助手 · 协作试用版

本版本用于独立分支 `codex/scenario-shadow-trial` 的协作试用，保留原接口与主分支。上游基线记录在 `docs/shadow-base.json`；原 README 保留在 `docs/upstream-README.md`，其中验证与凭证说明属于队友环境，不代表本机状态。

## 打开

本机双击 `启动影子版本.command`，打开 http://127.0.0.1:8790/scenario/ 。原单平台页面仍在 http://127.0.0.1:8790/ 。如端口被占用，关闭已有影子服务后再启动。

## 队友快速试用

需要 Node.js 24 和 pnpm。在新的文件夹检出试用分支，避免覆盖已有工作：

```sh
git clone --branch codex/scenario-shadow-trial --single-branch https://github.com/cloudy-7day/qiuqiuyaoyao.git huawei-shadow-trial
cd huawei-shadow-trial
pnpm install --frozen-lockfile
pnpm build
```

将 `.env.example` 复制为 `.env.local`（Windows 可在资源管理器中复制），在本机填写：

```dotenv
DEEPSEEK_API_KEY=填写自己的密钥
IMA_OPENAPI_CLIENTID=填写自己的客户端ID
IMA_OPENAPI_APIKEY=填写自己的ima密钥
IMA_KB_NAME=任德耀新建华为PC知识库
PORT=8790
```

账号须能访问该知识库。不要把填好的文件提交到 GitHub。然后在仓库根目录运行：

```sh
pnpm doctor
pnpm start
```

打开 http://127.0.0.1:8790/scenario/ 。若只配置 DeepSeek，可先测试场景理解；真实检索和后续生成需要 ima 凭证。doctor 报错时先检查凭证及知识库权限。

已有外部配置也可复用：macOS/Linux 使用 `SHADOW_ENV_FILE=/absolute/path/to/.env.local pnpm start`；Windows PowerShell 先设置 `$env:SHADOW_ENV_FILE="C:\path\to\.env.local"`，再运行 `pnpm start`。若旧配置指定了其他 PORT，浏览器地址也要同步修改。

### 建议试验顺序

1. 输入一张场景卡，点击“整理客户需求”；页面只显示简短摘要和本轮必要问题。需要核对依据、推断或更正时，打开“核对需求”。
2. 补充必要信息并重新理解，人工核对后确认。存在关键冲突时应暂停后续。
3. 填写知识库中完整产品型号，确认选择，导出三平台任务，核对与原协议兼容。
4. 检查接口连接，再运行真实 ima 检索与三平台生成；检查来源、各平台结果和失败提示。
5. 修改原始输入，确认旧结果失效，需要重新理解。

反馈请附脱敏场景、复现步骤、报错或结果截图，不要附密钥。当前实现按销售确认的型号检索，尚未实现大模型自主扩展检索词。

## 哪些部分保留，哪些部分改进

- 使用基于 12 篇小红书需求帖形成的 12 个理解维度（v0.2），用于第一步输入处理的模型提示词、输出校验与结构化上下文；来源与标准见 `docs/RESEARCH.md`、`docs/UNDERSTANDING-STANDARD.md`。输入自然语言即可，未提及内容保留未知，不逐项逼问。
- 12 个维度是后台理解标准，不占用主控台内容区。页面保留场景输入、简短需求摘要和必要追问；完整分析与更正在按需打开的“核对需求”中。主内容区域用于后续营销方案。模拟卡只用于可选试用。
- 保留队友 ima 检索、产品目录定位、引用编号校验、营销输出 schema 和原 `/api/run` 接口。
- 新增 `src/handoff.mjs`：将确认后的洞察转换为原 `product/audience/scenario/platform/goal/notes` 格式；完整结构化洞察单独传递给模型，不压扁丢失。
- 用户未指定产品仍可理解场景；要接队友链路时必须由销售明确选择完整型号。没有实现自动产品推荐，不会擅自填型号，也不把检索目标冒充客户原始意向。
- 默认选中小红书、公众号、朋友圈；复用一次 ima 检索，逐平台生成。每个平台保留原来的六字段结果外壳，方便队友接收；全平台包另用 `schema_version=shadow.1`。
- 服务端重新计算放行条件，不相信前端自报 ready。修订后须重新分析；重复确认旧分析不能清除修订暂停。
- 场景超过原协议2000字符时明确阻止，不静默截断。用户修改示例后保留原示例及“新增内容不属于原帖”的标记。

## 模块边界

场景理解属于第一步输入的后端处理，不是最终主控台的主要展示内容。`POST /api/analyze` 按后台标准输出结构化需求、原文证据和追问；`POST /api/confirm` 记录人工核对；`src/handoff.mjs` 把确认后的完整需求交给后续 ima 与内容链路。无需展示全部维度，也不能通过隐藏页面来取消关键条件校验。消费者界面只取必要摘要与追问，完整记录仍可按需核对。

## 接入与错误约定

`POST /api/analyze`、`POST /api/confirm` 保留场景模块协议。

`POST /api/handoff`：传 `{analysisId, product, productConfirmed:true, platforms:["小红书"], audience:"", goal:"引导咨询和到店体验"}`，返回 `handoff.1` 的任务数组与独立客户理解上下文。analysisId 必须来自本服务内存中、已确认且一小时内的分析。

`POST /api/run-scenario`：同上输入，返回 NDJSON。事件有 progress、platform_result、platform_error、result、error。HTTP 200 不是成功凭据，必须等待最终事件。部分失败时最终 result.complete=false，并保留成功平台结果与错误列表。检索整体失败时输出 error，停止生成。

旧 `/api/run` 请求和响应不变。旧 `contracts/input.schema.json` 和 `contracts/output.schema.json` 均原样保留。`modelscope-upload/` 是上游历史副本，未同步本次变更，不用于运行影子版本。

## 本次验证

- 37 项本地测试通过，包含队友原测试、场景模块测试和新增兼容测试。
- 构建通过。浏览器桌面1440×1000、手机390×844无横向溢出或脚本异常。
- 真实 DeepSeek：完成理解、人工确认、三平台兼容任务导出。v0.2 已用一段包含多任务负载、平板扩展屏、便携、接口、存储、使用年限的场景，验证新增维度提取、预算留白、关键协同追问及原文证据；桌面与手机页面检查通过。
- 真实 ima：本机缺少凭证，实际请求返回缺少凭证错误，未宣称检索通过。
- 平台成功结果展示、切换、原协议下载和部分失败处理使用明确的测试数据验证，不冒充真实 ima 联调。
- Browser 插件未提供，IAB 在本会话连续超时；UI 验证使用现有 Playwright Chromium。

```sh
pnpm test
```

## 仍待完成

完整真实端到端联调需要在本机配置 `IMA_OPENAPI_CLIENTID` 与 `IMA_OPENAPI_APIKEY`，确认账号已加入比赛知识库，然后使用页面“检查接口连接”和真实场景运行。逐句事实核验、产品自动选型、报价计算与自动发消息均未实现。这里的确认只代表客户需求经过核对，不能等同于产品适配通过。
