# ima + DeepSeek 最小链路实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 用本地已有凭证完成输入卡 → ima 原文检索 → DeepSeek → 结构化输出与导出，真实连接未通过时明确失败。

**Architecture:** Node.js 标准库，复用 vendor 官方 ima 调用脚本。输入契约、输出契约和提示词独立，方便三人分别迭代；CLI 与本地页面使用同一个 pipeline。

**Tech Stack:** Node.js 24，原生 fetch/http，node:test，无安装依赖。

## Global Constraints

- 用户要求先跑通，不要求输入输出质量高；不训练模型，不构建复杂检索平台。
- 凭证从本地环境或现有 ima 配置读取，禁止写入源码、输出和日志。
- 仅只读访问指定知识库；不上传、不发布、不自动发送跟进消息。
- 引用保留资料标题；没有原文不能冒充知识检索成功；价格缺规则时待确认。
- 目前 ima 返回 200002，DeepSeek 模型列表已连通；必须分别报告状态。

## Task 1: 输入输出契约与编排

Files: `contracts/input.schema.json`, `contracts/output.schema.json`, `prompts/system.txt`, `src/pipeline.mjs`, `tests/pipeline.test.mjs`.

- [x] 先写输入校验、检索失败中断、无来源中断、引用不存在中断的测试，运行 `node --test tests/pipeline.test.mjs` 看见失败。
- [x] 实现 `runPipeline(input, {retrieve, generate, progress})`，返回 `{schema_version,input,output,sources,checks,meta}`。
- [x] 输入同伴修改 input.schema；输出同伴修改 output.schema 和 system.txt；其余同伴不必修改接口代码。
- [x] 运行测试确认失败分支不会调用模型或输出伪造成功结果。

## Task 2: 两个服务接入

Files: `src/config.mjs`, `src/ima.mjs`, `src/deepseek.mjs`, `tests/adapters.test.mjs`.

- [x] 为 ima 业务错误、空搜索目录回退、分页和获取原文编写失败测试。
- [x] 封装官方脚本 subprocess timeout，固定 ima 官方域名；实现知识库精确匹配、搜索和按产品目录回退。
- [x] 从 get_media_info 指定链接读取文本，不向原文地址转发 ima 凭证。
- [x] DeepSeek 使用本地 key，选择模型列表中的 deepseek-flash，调用 JSON 输出；错误和超时明确展示。
- [x] 运行本地测试，以及真实 ima / DeepSeek 探测；授权失败保留为待修复状态。

## Task 3: 可运行入口和交接

Files: `cli.mjs`, `server.mjs`, `public/index.html`, `examples/task.json`, `README.md`, `.gitignore`, `package.json`.

- [x] CLI 支持 doctor / run；本地页面绑定 127.0.0.1，输入表单读取同一契约，结果可复制和下载。
- [x] HTTP 层校验请求类型、大小和同源；结果以 textContent 渲染。
- [x] 完成真实任务冒烟测试；保存本地结果时排除签名链接、密钥和知识库内部 ID。
- [x] 运行 `npm test`、CLI doctor、页面 HTTP 检查，记录验证结果与尚未解决的阻塞。

## 验收

只有 ima 返回真实原文、DeepSeek 用这些原文生成并成功导出，才标记端到端通过。模拟测试与单独 DeepSeek 测试不能替代此项。

## 执行结果

已完成真实 CLI 和浏览器两条链路（新生小红书、职场朋友圈），每次约50秒，各取得3份文本和3张图片。16项测试通过；浏览器渲染与JSON下载通过；代码审查的3项问题均已修复并复核。ima初始认证失败已通过用户提供的有效凭证解决。服务在127.0.0.1:8787运行，最终连接检查两端均成功。
