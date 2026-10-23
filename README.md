# 华为 PC · 门店增长助手 · 复赛增强版

基于初赛主线 `b462d798`，复赛试用分支 `codex/semifinal-evidence-search`，入口 `/scenario/`。主分支保留初赛作品；此分支供团队下载运行，未部署到魔搭。

**先看：[90 秒演示视频与脚本](demo-video/README.md) · [本次改进说明](本次改进说明.md) · [通勤图文样例](examples/commute-xiaohongshu/README.md) · [下载完整源码 ZIP](https://github.com/cloudy-7day/qiuqiuyaoyao/archive/refs/heads/codex/semifinal-evidence-search.zip)**

店员填写客户困扰、选择本轮产品（或按需求推荐）、选择门店能提供的帮助 → 一键生成图文。后台完成需求理解、候选与硬条件检查、资料检索及逐句核验；非阻断问题收进展开区，输入冲突仍需先澄清。

## 这版做了什么

- 理解用户：恢复 12 个研究维度、19 类观察标准；事实、推断、未知分开记录。标准用于后端理解，不做主控台的 12 张展示卡。原话和修订保留。
- 追问与选型：大模型提取需求，再按候选证据与差异选择问题；系统、重量、屏幕等明确限制在服务端检查。未知预算／软件允许有限草稿，不当作已经适配。可手动指定产品。
- 知识检索：1,002 篇资料分成 12,011 个带来源的片段，支持关键词、真实向量、RRF 混合检索。只用产品事实正文证明功能；场景、FAQ、写作资料用于参考。
- 图文交付：小红书生成封面、3 张判断卡、完整正文及 2 条店员咨询回复。支持 4 张 1200×1600 PNG 和正文的 ZIP 素材包、文本、离线 HTML 导出；预览与 PNG 使用同一绘制器。其他渠道保留旧图文模式。没有接入发布平台。
- 操作收简：首屏只保留客户困扰、型号和门店帮助；需求分析、来源与核验记录折叠。通勤示例与所选产品分开记录，不把演示型号伪装成客户原话。
- 减少幻觉：生成后独立审查句段，程序检查逐字引文、型号、数字与必要条件。结构或排版不合时最多完整重写一次；事实审核后最多一次局部修订，再次审查。不会用截字方式删除必要条件，没有有据核心卖点或审核失败时暂停交付。

图片继续来自已有资料库，跳过索引标注 blur／模糊的预览图。新小红书素材包至少需 1 张合格原图作为封面，3 张内容卡允许纯文字；旧文案模式保持原有配图要求。未接入商城抓图或 AI 生图；产品外观和配置不靠生成图证明。追问澄清客户需求，产品事实仍必须由资料支持。

## 本地运行

要求 Node.js 24、pnpm。复制 `.env.example` 为 `.env.local`，只在本机填写 `DEEPSEEK_API_KEY`，不要提交凭证。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

地址：`http://127.0.0.1:8792/scenario/`。本机已配置的版本可双击 `启动复赛版本.command`。Windows 可执行 `./scripts/start-local.ps1 -EnvFile ./.env.local`。

默认 `KNOWLEDGE_SOURCE=local`，读取用户提供的 `knowledge/` 原文和图片，不表示执行了在线 ima 检索。仅切回 `KNOWLEDGE_SOURCE=ima` 时才需要 ima 凭证。资料包版本和来源保留在返回值中；未接入实时价格、库存或软件实测。

## 向量检索实验

默认 `SEARCH_MODE=lexical`。同一组 20 条冻结样例中，关键词 Recall@5 为 **77.78%**，向量 **55.56%**，混合 **61.11%**；当前不能宣称向量整体更好。评测含 18 个正例和 2 个负例，未经人工盲审，不代表真实用户总体准确率。详见 `evaluations/retrieval-results-2026-10-22.json`。

向量模型为固定版本的 `Xenova/paraphrase-multilingual-MiniLM-L12-v2`，384 维、CPU q8，在本机编码资料；不向外部 embedding API 上传知识库。

```sh
# 首次需要下载公共模型；如 Node 下载失败，可先使用 Python 下载器
python3 scripts/cache-embedding-model.py
pnpm search:build
pnpm search:evaluate
```

构建后，在 `.env.local` 设置 `SEARCH_MODE=hybrid` 或 `vector` 并重启服务。索引存在 `output/search-cache/`，不纳入 Git 或部署包；知识库或编码版本变化会使旧索引失效。缺少有效索引／模型失败时明确返回 `lexical_fallback`，不会虚称向量成功。运行中建成或替换索引可被识别。

## 验证与对接

```sh
pnpm test
pnpm build
pnpm test:browser
```

浏览器测试需要 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定模块路径、`LOCAL_APP_URL` 指定服务地址。浏览器回归使用合成响应，不消耗模型额度；真实 DeepSeek、真实向量评测与合成 UI 测试分开记录。验收证据见 `docs/SEMIFINAL-VERIFICATION.md`。

| 范围 | 文件 | 约定 |
|---|---|---|
| 理解与决策 | `modules/scenario/server/`、`shared/standards.mjs`、`shared/decision-support.mjs` | 原话可追溯；修订重新理解；明确冲突在服务端拦截 |
| 检索与事实 | `src/retrieval/`、`src/local-knowledge.mjs`、`src/claim-review.mjs` | 参考资料不能证明功能；检索相似不等于事实支持 |
| 图文与界面 | `prompts/`、`modules/scenario/src/`、`shared/publication.mjs` | 交付完整草稿；条件随主张保留 |
| 服务集成 | `src/scenario-service.mjs`、`src/runtime.mjs` | NDJSON 的 HTTP 200 不等于生成成功，必须检查终态 |

输出继续保留 `customer_insight`、`strategy`、`content`、`image_plan`、`source_refs`、`pending_confirmation` 六字段。新小红书输出可选扩展 `marketing_package`（封面、3 卡、2 答复），每个文本字段均纳入审查；旧结果不要求该字段。输入新增独立 `store_support`：`selection_guidance`（默认）、`software_check`、`in_store_demo`，不能从客户原话或 goal 推定门店服务。审查记录在 `checks.claim_review`。旧 `/api/run` 保留兼容。发布用文本去除引用编号，原始输出仍保留来源；暂停交付时不保留可导出的营销包。

## 部署包与边界

`pnpm package:modelscope` 生成忽略于 Git 的 `modelscope-upload/`。包内包含源码和用户提供的知识库，排除环境文件、依赖、本地模型、索引和历史结果。Docker 默认关键词检索；如需向量实验，应配置持久化缓存并在目标环境构建索引。生成部署包不代表已部署或已完成 Docker 构建测试。

模型辅助核验仍可能误判，不能替代人工检查。图像内容没有做视觉事实识别，只校验来源、型号归属和文件。自动修订可能删掉缺证据的句子，需要检查成稿连贯性。没有多用户账号隔离；分析记录保存在内存，重启后需重新理解。未添加自动发布或客户消息发送。
