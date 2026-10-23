# 有为智选本地体验与复赛验收实施计划

**Goal:** 固定进度导航，先呈现场景分析再交付图文，完成两平台、两场景、至少三组真实生成验收。

**Architecture:** 保留现有单段输入、研究数据库、产品证据检索与逐句核验。由主页面管理进度，Handoff 回传真实事件；图文仅改变展示，不改写已核验内容。

**Tech Stack:** Node.js 24、React、Vite、SQLite、本地知识库、DeepSeek。

## 约束

- 保留所有既有本地修改，仅本地运行，不推送线上。
- 只有学生与职场会议示例入口；普通未知不阻塞、不新增问卷。
- 图片归属与知识库核验继续强制执行，失败不能标记完成。
- GitHub 以 origin/codex/semifinal-evidence-search 的 8bc6fe6 为本次评审基线；选择性移植，不覆盖整条分支。

## 实施与验证

- [ ] main.jsx/Handoff.jsx/guided-motion.js：固定顶栏与三阶段状态；分析后引导一次、最终结果后引导一次；失败可重试。浏览器模拟延迟检查停留位置与手动滚动。
- [ ] role-examples.mjs/ScenarioCard.jsx：删除医生律师及运营目标入口，保留任务与原文依据；整合队友理解维度标准。
- [ ] publish-copy.mjs/ResultView.jsx：图片穿插段落，去重、保留产品图片说明；复制/导出保持纯文案，验证段落与图片对应。
- [ ] experience.mjs/prompts/moments.txt/pipeline.mjs：开放朋友圈，独立短文风格与配图规则；共享事实核验。
- [ ] scenario-service.mjs/RecentResults.jsx：展示两平台多组本地真实成果。
- [ ] 完成单元测试、桌面/手机浏览器回归、三组以上真实生成、内容质量审阅；记录分支整合取舍与验收证据。
