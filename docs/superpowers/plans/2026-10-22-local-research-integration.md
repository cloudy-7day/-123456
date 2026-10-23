# Local research integration implementation plan

**Goal:** 本地跑通学生与职场会议的小红书成稿，实际检索复赛数据库并对最终产品主张进行知识库复核。

**Architecture:** Node 24 内置 SQLite 只读检索研究素材；原有型号严格匹配的资料包继续作为产品原文。生成器接收分区素材；独立审阅调用逐段覆盖成稿与图片说明，证据引用/原文摘录由代码再次验证，失败最多改写一次，仍失败则暂停交付。React 展示完整成稿，研究依据和核验记录可展开。

**Constraints:** 只修改和启动本地版本，不推送；不读取输出密钥；研究假设不得变为客户事实；未执行审阅不得显示核验完成；不会要求用户填齐未知条件。

## Tasks

- [x] 数据检索：新增 src/research-context.mjs 与 tests/research-context.test.mjs；接口 retrieveResearchContext(input,{databasePath,customerContext}={})，返回 scenario_id、research_context、writing_patterns、product_classification、content_brief、provenance。固定白名单场景，客户文本优先；排除数据库不合格记录；产品分类严格匹配完整型号；未知身份不默认学生。
- [x] 输入与界面：学生示例用同一份小组汇报串联三个地点，新增职场会议示例；支持 handoff businessScenario 和 contentGoal 显式运营偏好，映射 task.business_scenario/content_goal；前端通过 ResultView 展示 checks.semantic_review、review_trace 与 meta.research 的可展开摘要。
- [x] 主张复核：新增 src/claim-review.mjs 与 tests/claim-review.test.mjs；每个句段设稳定ID；模型审阅必须覆盖全部片段、标记 supported/qualified/unsupported/contradicted/unverified/not_applicable 并给精确产品原文证据；图片不能证明功能。空审阅/漏段/伪造摘录视为失败，未知主张不可通过。
- [x] 主流程：runPipeline 接受 retrieveResearch/review 依赖；DeepSeekClient 新增 review，generate 接受 researchContext/revisionFeedback；运行入口 runtime 与 shadow-batch 均启用实际检索和审阅。保留六字段成稿契约，失败结果 blocked 且不提供正文导出；最多两次生成及两次审阅。
- [x] 验证：先运行新增测试看到失败，完成后跑 node --test 和 npm run build；真实本地 HTTP 运行学生和会议两组，包括理解→确认→生成→核验→图片；浏览器检查复制/导出及展开信息。

## Completion evidence

记录测试数量、构建结果、两组本地结果位置、最终核验状态和可访问地址；只报告执行得到的结果。保留 git diff，不提交线上。

本地实跑补充：增加独立小红书润色，复核失败后对已审原稿局部修订，第二轮不再次自由润色。会议任务加入有依据的屏幕/键盘候选匹配。为本机连接问题增加可选 curl 传输，默认仍为原生 fetch。

最终验收：125/125 测试通过；Vite 构建通过；git diff --check 通过。学生 SC01（2轮、27片段、4图）与会议 SC02（1轮、22片段、3图）真实生成完成，复核 passed。页面保存示例、图片、研究/复核展开、复制/导出和移动端已验证。入口 http://127.0.0.1:8792/scenario/；详情见 docs/local-semifinal-verification.md。未提交或推送。
