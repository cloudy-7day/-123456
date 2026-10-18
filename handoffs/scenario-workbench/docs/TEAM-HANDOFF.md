# 队友参照说明

这是当前「知行」小红书图文工作台的可运行参考实现，放在独立交付目录，供输入、输出和链路同学按需对照。未替换根目录应用，也未覆盖 `handoffs/output-results` 的输出契约。

## 从哪里看

| 要参考的内容 | 文件 |
|---|---|
| 界面与需求核对流程 | `src/main.jsx`、`src/style.css` |
| 明确需求、推断、未知与冲突 | `shared/contract.mjs`、`server/prompt.mjs`、`docs/UNDERSTANDING-STANDARD.md` |
| 场景示例与原帖调研记录 | `shared/samples.mjs`、`docs/RESEARCH.md` |
| 系统、预算等硬条件筛选 | `shared/hard-requirements.mjs`、`src/ProductFilter.jsx` |
| ima 本地导出包读取、准确型号与配图检索 | `server/local-kb.mjs`、`server/retrieval.mjs` |
| 小红书文案、依据检查与修正 | `server/marketing.mjs`、`server/product.mjs` |
| 店员演示脚本 | `src/DemoScript.jsx`、`shared/demo-script.mjs` |
| 三张图与 ZIP 导出 | `src/OutputGallery.jsx`、`src/output.js` |
| API 路由 | `server/index.mjs` |

## 独立运行

需要 Node.js 22+、Python 3.9+（仅导入知识库需要）。在本目录运行：

```sh
npm install
cp .env.example .env.local
# 在本机编辑 .env.local，填写自己的 DEEPSEEK_API_KEY
python3 scripts/import-knowledge-base.py /path/to/知识库.zip
npm test
npm run build
npm start
```

Windows 可用 `Copy-Item .env.example .env.local`，Python 命令按本机安装选择 `python` 或 `python3`。

浏览器打开 http://127.0.0.1:4320/ 。知识库导出包需通过团队已有授权渠道另行取得，不在此公开提交中。导入后资料和索引位于被 Git 忽略的 `.local/`，后端读取该位置；更新知识库后重启服务。导入脚本只支持当前 v7 的 P1 Markdown/CSV/图片结构。

没有凭证或知识库时可以看界面和运行离线测试；不能完整生成真实图文。真实素材测试在没有本地库时会跳过，其他离线测试不调用模型。不提供假素材来伪装生成成功。

## 与根目录应用的区别及衔接点

根目录应用使用 ima 在线检索，参考工作台使用用户提供的 ima 导出包。两者都保留 ima 来源，但数据入口及接口格式不同，不能把这里的文件直接覆盖到根目录。

- 输入：根目录是 `product/audience/scenario/platform` 等契约字段；本实现提交 `sources[]` 原话及修订，生成带事实、推断、未知和冲突的洞察。接入时需显式转换，保留来源与修订顺序。
- 资料：根目录用 `S*/I*` 来源编号；本实现用来源 ID、逐字片段、事实 ID、已登记图片 ID。需要在真实检索结果上建立映射，不复用示例编号。
- 输出：根目录是 `content/source_refs/image_plan` 等契约；本实现还有 `demoScript/cards/assessment/quality` 等字段。需由集成同学决定映射或扩展契约，不能宣称现已兼容。
- 图片：此参考版只接受本地 ima 索引登记的素材路径，校验型号、来源和摘要。移植到在线链路时，需要让下载结果进入受控素材登记与校验流程。
- 当前只支持小红书；不包含自动发布，也不向客户发送内容。

## 已实现与待补齐

已实现：准确型号检索、ima 本地图片规则、图文依据检查、三张 PNG、可执行店员演示脚本、复制和 ZIP 导出、示例移除人工添加的 Windows 要求。

硬条件筛选按明确系统要求排除冲突型号。软件兼容没有直接依据、硬预算没有有效配置报价时进入待核实，暂不开放型号选择；仍可整理保存洞察。当前价格快照不能当有效报价，没有实现报价录入/验证闭环、自动推荐排序或按需求自动代选产品。

需求抽取和营销生成仍受模型输出影响；依据检查不等于实际软件兼容测试。历史验证记录在 README 中，不保证每个型号、每次生成都成功。刷新前导出，当前没有持久化草稿。

## 本次交付验证

仓库原有 16 项测试和工作台 49 项不依赖私有库的测试通过；在本机指定真实知识库后，素材完整性测试也通过（工作台共 50 项）。前端构建通过。此交付没有再次调用模型生成整套营销内容，历史端到端验证见 README。
