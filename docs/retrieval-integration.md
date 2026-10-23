# 本地场景辅助检索

本次仅选择性引入队友的检索模块，不复制知识库目录、产品目录或图片。现有图片 SHA 视觉审核、预览选择、同型号归属、图片去重与补图来源字段保持原逻辑。

## 接口

`new LocalKnowledge({knowledgeDir, localOutputRoot, searchMode, searchCacheDir, searchClient})`：后三项为新增可选参数。`searchMode` 默认为 `SEARCH_MODE || 'lexical'`；缓存目录默认为 `SEARCH_CACHE_DIR || ROOT/output/search-cache`。可注入 `{async search(query, options)}`，无需调用模型。

`retrieve(input, progress)` 保留原返回值并新增 `context_retrieval`，它是整个 evidence 对象上的独立字段：

```js
{
  mode: 'lexical', // 或 hybrid、vector、lexical_fallback、not_requested、unavailable
  requested_mode: 'lexical',
  results: [], // 选中的分块，包括原始限定、来源、排名、分数、用途
  stats: {documents, chunks, eligible_chunks, lexical_candidates, vector_candidates, returned, model},
  warnings: []
}
```

未给场景、受众、目标、平台时返回 `not_requested` 与空结果；此时以及检索失败时 `stats` 至少包含 `returned:0`。失败返回 `unavailable`，警告同时加入 evidence.warnings。完整产品原始文档继续逐字进入 `sources`，辅助检索结果不会加入 `sources`。

默认请求以场景、受众、目标、平台拼接 query，固定所选 `productId`，类型为 `product_guidance/scenario/faq/style`，最多返回四条。同一原始文件最多两条。每条 hit 含 `source_path/source_sha256/source_type/product_id/product_ids/model/system/mentioned_product_ids/section/text/content/qualifiers/fictional/supports_product_fact/usage/ranks/scores/matched_terms/retrieval_mode/explanation` 等字段。辅助资料只能帮助表达与追问，不可支持产品能力或真实客户体验声明；消费端须继续尊重 `usage` 和 `qualifiers`。

底层 `createKnowledgeSearch({knowledgeDir, cacheDir, embedder})` 返回 `search(query,{productId,types,limit,mode})`、`status()` 和 `build({mode,batchSize,onProgress})`。底层原接口模式默认 hybrid；业务 LocalKnowledge 明确默认 lexical。BM25 使用中文分词与双字词，章节/段落分块同时保留限制章节。产品事实要求明确选型号；不同型号、明确系统和多型号归属均在排序之前过滤。同名跨系统型号的无归属提及按歧义处理，不因词法匹配顺序选择系统。

## 向量可用性

只检查了本地文件，无下载或真实模型推理。队友 `teammate-preview-8bc6fe6` 以及当前项目都未安装 `@huggingface/transformers`；队友树未找到 search-cache/models 缓存或向量索引。默认 lexical 不依赖此包。缺少索引时 hybrid/vector 直接返回 `lexical_fallback` 并警告，不生成假向量。可选本地 embedder 设置 `local_files_only:true`，即使已有索引但缺模型也禁止自动下载，查询失败如实降级。测试只在临时目录用显式假 embedder 验证索引、RRF 和损坏恢复。

## 验证

`node --test tests/retrieval-engine.test.mjs tests/retrieval-integration.test.mjs tests/image-selection.test.mjs tests/local-knowledge.test.mjs`：29 项通过。覆盖原文限定、资料完整性、跨型号/跨系统阻断、同源限额、辅助源与事实隔离、注入、失败保留原文、向量降级/损坏/恢复，以及原视觉审核逻辑。实际内置目录的 lexical 查询读取 1002 文档、12011 分块并返回四条辅助结果，无 embedding 调用。

Windows 沙盒 Temp 下对已有文件 rename 会出现 EPERM，因此向量测试在工作区 output 下创建并清理临时测试目录。
