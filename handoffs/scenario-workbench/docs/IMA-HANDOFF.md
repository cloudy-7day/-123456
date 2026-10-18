# ima 本地副本适配

按用户最新授权，原先预留的 ima 段接入用户提供的知识库 ZIP。本地副本保持 ima 来源标识，没有改用官网抓取或模型记忆。

- `server/local-kb.mjs`：加载私有索引，准确匹配型号，读原文与限制，调用需求对照，按图片索引选同型号的非模糊图。不会自动查网上最新资料。
- `server/pipeline.mjs`：`loadImaBundle` 接本地适配器，校验引用和图片型号，再进入既有后半程。`provider=ima_local_export` 与未来实时接入的 `ima` 区分。
- `GET /api/ima/status`：库名、包名与 SHA256、导入日期、支持型号及图片数量；不返回私有目录和凭证。
- `POST /api/draft`：必须读取知识库；缺资料时报错，不自动退回预演。
- `POST /api/preview`：开发时单独调用的无产品事实预演路径，主界面不会自动使用。
- `/assets/ima/:id`：仅服务索引中登记的本地图片，按SHA256检查内容完整性，不接受任意路径。

导出记录区分“逐字引用/图片索引已检查”和“人工复核/软件兼容/实际销售版本待确认”。用户手动修改后标记需要重新复核。`publishReady` 始终为 false，系统不自动发布。

迁回实时 ima 时，更换服务端 `loadImaBundle` 适配器即可，保留同一资料包结构：provider、status、knowledgeBase、product、sources、facts、images。图片必须安全读取到本机，并保留 ima 原始来源和型号。不要把本地 ZIP 成功读取记录成实时 API 验收通过。
