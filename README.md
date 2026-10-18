# 华为 PC 门店增长智能体 · 最小链路

用本地 ima 凭证读取比赛指定知识库的原文与图片，再使用 DeepSeek 生成结构化方案。优先验证真实接口、来源传递和导出，输入内容与输出质量留给团队继续细化。

## 启动

需要 Node.js 24，无需安装 npm 依赖。在本目录打开终端：

```powershell
npm start
```

访问 http://127.0.0.1:8787 。页面可输入任务、检查连接、生成结果、查看原文与配图、复制文案和下载 JSON。

```powershell
npm run doctor
npm run demo
npm test
```

- `doctor`：分别验证 ima 指定库权限与 DeepSeek 可用模型。
- `demo`：读取 `examples/task.json`，真实运行并保存 `output/latest.json`。
- `test`：运行本地单元与 HTTP 测试，不调用付费模型。
- 若已启动服务，直接打开页面即可；更改凭证后重启服务。
- Codex 沙箱可能阻止外网 DNS 或本地回环连接；在正常终端运行，或给予本次网络访问权限。

CLI 自定义输入：

```powershell
node cli.mjs run --input examples/task.json --output output/my-result.json
```

## 三人协作边界

发给两位队友的详细交接文档：[输入卡与输出结果对接说明](docs/队友对接说明.md)，含交付清单、JSON 示例、修改边界及联调步骤。

| 负责人 | 主要文件 | 交接要求 |
|---|---|---|
| 输入卡 | `contracts/input.schema.json`、`examples/task.json` | 定义字段含义、必填项、枚举、默认值、示例；页面自动读这个契约 |
| 输出结果 | `contracts/output.schema.json`、`prompts/system.txt` | 定义各区块结构、表达要求和示例；页面按结构渲染 |
| 链路集成 | `src/ima.mjs`、`src/deepseek.mjs`、`src/pipeline.mjs`、`server.mjs` | 负责连接、数据流、错误处理、来源、运行与导出 |

当前约定保留的输入字段：`product`、`audience`、`scenario`、`platform`；可新增字段。

当前约定保留的输出字段：`content.title/body/call_to_action`、`source_refs`、`image_plan[].source_ref`；修改这些字段时同步集成人员。

契约校验器支持本项目使用的 JSON Schema 子集：`type`、`properties`、`required`、`enum`、`maxLength`、`items`、`minItems`，不是完整 JSON Schema 引擎。默认表单面向平铺字符串字段；增加嵌套输入、数值或复杂控件时由集成人员扩展页面。

## 配置

程序读取现有进程环境变量，补充加载 `.env.local` / `.env`；已有环境变量优先。ima 官方脚本还会回退到用户目录下 `.config/ima/client_id` 和 `.config/ima/api_key`。

| 变量 | 用途 / 默认 |
|---|---|
| `IMA_OPENAPI_CLIENTID` | ima Client ID |
| `IMA_OPENAPI_APIKEY` | ima API Key |
| `IMA_KB_NAME` | 默认 `任德耀新建华为PC知识库`，按名称精确匹配 |
| `DEEPSEEK_API_KEY` | 使用机器上已有 DeepSeek 环境变量 |
| `DEEPSEEK_MODEL` | 默认 `deepseek-flash`，本机账号模型列表已验证 |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com`；也支持本机兼容接口地址 |
| `PORT` | 默认 `8787`，仅监听 `127.0.0.1` |

本机有效 ima 配置已保存于 `.env.local`。`.env*` 凭证文件、`.ima-local/`、`tmp/`、`output/` 均已排除版本控制；不把它们上传仓库。`.env.example` 仅含变量名称和非敏感默认值。

此前已有的 `scripts/ima-client.cjs` / `ima-check.cjs` 使用 `.ima-local/credentials.json`，已保留。这与本应用的 `.env.local` 是两套读取入口；更新某一份不会自动同步另一份。本应用用 `npm run doctor` 检查。

## 当前数据流

1. 按输入契约检查任务，缺少产品、客户、场景或平台时停止。
2. 用官方 skill 查找指定知识库，兼容实际返回的 `kb_id/kb_name`。
3. 搜索完整产品名，浏览命中目录并核对路径，只选择 P1 下带产品事实文件的目录。
4. 搜索未定位时按目录回退，支持游标分页。拒绝模糊选择多个型号。
5. 通过 `get_media_info` 读取产品事实、卖点限制、图片索引；下载同产品 `images` 中最多3张图片。
6. 将输入、带来源编号的原文、图片名称、输出契约传给 DeepSeek；不发送 ima 凭证和签名访问链接。
7. 检查 JSON 结构与引用编号；保留原文、图片文件、待确认事项、运行时间。
8. 页面展示与导出，或 CLI 写入指定 JSON 文件。

`output/latest.json` 保存最近一次成功运行；生成失败不会用虚假或固定结果替代。图片保存在 `output/media/`。页面刷新后点击“上次结果”查看已保存结果。

## 已验证与当前范围

- 真实读取指定 ima 知识库，取得 MateBook 14 鸿蒙版的3份文本资料和3张图片。
- 真实调用 DeepSeek，生成客户洞察、策略、图文、演示建议、跟进计划和待确认项。
- 首次 CLI 端到端约50秒；实际耗时随网络和模型负载变化。
- 页面端已验证“职场出差＋朋友圈”任务，约50秒，JSON下载与3张图片展示正常，浏览器无脚本异常。
- 两组结果分别保存在 `output/sample-xiaohongshu.json` 和 `output/sample-moments.json`。
- 16项本地测试通过，覆盖认证/业务错误、空搜索目录回退、分页、同名型号歧义、单图失败、无原文中断、来源引用、模型截断、同源、输入校验和中文请求分片。

当前仅验证 JSON 结构和引用编号是否存在。没有实现逐句事实核验、视觉型号核验、完整营销合规检查、价格计算引擎和自动发送跟进。报价明确待规则；跟进仅生成建议。

检索目前支持知识库的 P1 产品目录及 Markdown/CSV 文本和 PNG/JPEG/WebP 图片；笔记、PDF/Word正文解析、扩展产品发现卡、其他库布局和多产品比较需要后续扩展。素材链接只接受官方 ima 与腾讯云存储地址；不对来源 URL 进行任意外网抓取。

指定产品时使用知识库的完整型号，例如 `HUAWEI MateBook 14（鸿蒙版）` 或 `MateBook 14 酷睿 Ultra`，不要仅写“轻薄本”。

## 接口依据

- ima：仓库中官方 `vendor/ima-skills-1.1.10/ima-skill/` 及其接口文档。
- DeepSeek：[官方 Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)。

## 小红书场景工作台参考实现

[队友参照说明](handoffs/scenario-workbench/docs/TEAM-HANDOFF.md) · [独立工作台](handoffs/scenario-workbench/README.md)

提供客户洞察、硬条件筛选、ima 本地导出包检索、图文及店员演示脚本、PNG/ZIP 导出的独立实现。未替换根目录在线 ima 链路，接口转换及待补齐项见参照说明。凭证和私有知识库需在本机配置。
