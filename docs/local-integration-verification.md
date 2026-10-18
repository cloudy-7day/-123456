# 本地整合验证记录

验证日期：2026-10-18。工作目录 `integrated-app`，分支 `codex/local-integration`，入口 `http://127.0.0.1:8791/scenario/`。原 8787 服务未替换；未推送 GitHub 或部署魔搭。

## 代码来源

- 输入场景分支 `codex/scenario-shadow-trial`：`a48f3bb2d83c80feb271f020a8c9df296a7b16b3`。
- 主分支输出交付：`56f6b3fa8597d571faac96ebbe955a73c7914df5`。
- 共同基线：`bc0deb1cb97ac83d8ebc3af4d4f4679e148bb4d5`。
- 原始交付在 `handoffs/output-results/`；生效代码为根目录 schema/prompt 和 `src/`、`modules/scenario/`，不运行交付目录内另一套副本。

## 已验证

| 项目 | 结果与证据 |
| --- | --- |
| `pnpm build` | React 前端构建通过。 |
| `pnpm test` | 46 项通过，覆盖原链路、场景确认、输出结构、引用、冲突阻断、缺图、缓存原始日期与云端请求路由。 |
| 输出同学交付验证 | 7 个正常样例及 7 个负例通过。 |
| 真实 DeepSeek | 场景理解、人工确认后的三平台生成成功。 |
| ima 数据来源 | 此前真实检索保存的 3 份文本与 3 张图片；源时间 `2026-10-18T06:20:34.635Z`。显式启用缓存模式，未使用合成商品资料。 |
| 平台结果 | 小红书 `needs_images`，公众号和朋友圈 `draft`；三平台生成完成，无生成错误或 blocked 项。 |
| 浏览器 | 平台切换、文案复制、JSON 下载、图片加载通过；移动端无横向溢出，无脚本错误。 |
| 历史展示 | 服务重启后读取保存的三平台结果，复制、下载与图片仍可用；本项未再调用模型。 |
| 生成过程编辑 | 延迟流式响应测试确认输入及审核控件锁定，避免父组件卸载生成面板。 |
| 代码复核 | 复核发现的缓存日期刷新、生成中上游编辑两项问题已修复并验证；未发现剩余阻断项。 |

模型仅接收图片元信息，未读取像素，不能宣称做过视觉匹配。结构及来源编号通过校验，也不代表所有产品事实逐句审核通过。小红书本次仅选择两张图片，页面明确提示缺图；平台篇幅仍有优化空间。

## 未通过的实时检索与待补验

实时 ima 接口连接检查成功，但资料获取返回 `220021: 资料获取次数已达上限，请明天再尝试`。因此**不能宣称本次新检索 → 生成全链路已通过**。没有自动吞掉错误或静默退回缓存。

可用演示明确采用旧资料：源产品为 `HUAWEI MateBook 14（鸿蒙版）`，知识库为 `任德耀新建华为PC知识库`。后端要求缓存产品与请求产品一致；页面和结果保留缓存警示及原始资料时间。DeepSeek 依然是真实调用。

额度恢复后，停止整合版 8791 进程并运行 `scripts/start-local.ps1 -EnvFile ..\.env.local`，不要传 `-EvidenceFile`。在页面重新分析、确认、选型并生成三平台结果，核对检索模式为实时、sources 非空、图片正常、最终 NDJSON 无 error。不能用连接检查代替资料检索验证。

Dockerfile 已按 Node.js 24 与 7860 端口准备，部署包由白名单生成；本机 Docker 引擎未启动，镜像构建尚未验证。魔搭仓库尚未同步。

## 本机证据位置（均不进入部署包）

- `output/browser-verification.json`：真实 DeepSeek 加缓存资料的浏览器验证。
- `output/review-ui-verification.json`：历史展示与复制下载复核。
- `output/shadow-latest.json`、`output/live-three-platform.json`：完整三平台结果。
- `output/live-analysis.json`、`output/live-confirmed.json`：分析和确认。
- `output/local-desktop-preview.png`、`output/local-mobile-preview.png`：桌面和手机预览。
- `tmp/local-server.json`：当前本地服务进程记录；日志在同目录。

`output/`、`tmp/`、本地凭证和依赖均被忽略。运行 `pnpm package:modelscope` 会重建部署包和 SHA256 清单，防止本机源码与上传副本长期分叉。
