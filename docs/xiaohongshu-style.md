# 小红书成稿规则与验证

参考 GitHub `cloudy-7day/qiuqiuyaoyao` 的 main 提交 `56f6b3f`，读取 `handoffs/output-results/prompts/system.txt`、`examples/expected-output.json` 和 `docs/验收清单.md`。2026-10-18 查询远程 main 仍为该提交。

保留队友八字段输出、短标题、生活场景、短段落、相关话题与来源引用。在 `prompts/xiaohongshu.txt` 中补充场景开头、少量emoji、聚焦两个亮点、减少参数罗列、自然互动和不虚构亲测的写作指导。`src/pipeline.mjs` 仅在 platform 为小红书时加载，其他渠道不会收到这份专项规则。店员脚本仍是独立、可照做的约3分钟交付。

这是模型写作指导，不是字数、参数数量或语言风格的程序硬校验；仍需人工检查事实和表达。没有改写队友原始交接包，也未合并远程分支的其他新增输入规范。

验证：61项后端测试通过，新增测试确认专项提示词只注入小红书。使用真实DeepSeek、本地知识库和原始计算机新生输入完成浏览器一键生成，第二次结果标题“计算机新生背去图书馆怎么选”，正文374个Unicode字符（含引用、标签和换行），3张库内图片，店员脚本、复制、导出、图片加载及手机布局通过；无浏览器错误。生成仍可能偏离软性写作目标，例如参数数量和结尾追问仍有优化空间，未声称自动风格审核通过。

本机证据在忽略的 `output/xiaohongshu-style-events.json`、`output/xiaohongshu-style-verification.json`、`output/小红书风格-文案与店员脚本.txt`。规则已同步到 `modelscope-upload/prompts/xiaohongshu.txt`，未上传GitHub或魔搭。
