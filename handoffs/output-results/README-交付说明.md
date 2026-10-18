# 输出结果模块交付包

## 你现在可以交给队友什么

本包完成“输出结果同学”的三个核心文件，并补充对应输入、来源夹具、四平台理想结果与异常样例。

| 文件 | 用途 |
|---|---|
| contracts/output.schema.json | 保留八字段名称和类型，明确标题、字段含义、长度上限等 |
| prompts/system.txt | 可替换的完整系统提示词：需求画像、生活化换算、平台写作、引用、异常处理 |
| examples/expected-output.json | 小红书主样例：人工设计的目标结果，不是真实模型输出 |
| examples/output-task.json | 主样例的输入；不覆盖输入同学的 examples/task.json |
| examples/source-fixture.json | 主样例所用 S1/I1/I2/I3 的映射；不是生产来源接口定义 |
| examples/fixtures/ | 本地知识库摘录和核对用产品图 |
| examples/expected/ | 朋友圈、公众号、门店海报、缺图及资料冲突理想结果 |
| examples/input/ | 补充平台/人群输入样例，保持六个字符串字段 |
| examples/errors/ | 完全无来源的诊断反例；明确不符合成功结果schema |
| docs/前端与集成事项.md | 当前页面边界、展示建议与必须由集成人员实现的功能 |
| docs/验收清单.md | 人工审阅与真实联调步骤 |
| scripts/validate-handoff.mjs | 不联网、不调用付费模型的独立检查 |
| validation-report.json | 运行独立检查后得到的报告，不是真实生成记录 |

## 三行交接说明（可直接发队友）

本次修改：八个顶层字段及既有嵌套字段均未新增、删除、改名或改类型；补充title/description、文本长度限制、跟进day枚举与最低数量。写作规则加入需求排序、可解释生活换算、四平台适配、图片不足和资料冲突处理。
样例对应：examples/output-task.json → examples/expected-output.json；对应examples/source-fixture.json和examples/fixtures/。均为手写设计/测试夹具，不能作为真实运行结果。
需要集成：没有新增业务必填字段或复杂类型；合并前核对新增限制与旧样例兼容性。必须处理无来源阻断、引用语义/平台图片数量检查、冲突结果禁用成稿复制，以及配图实际插入和固定展示顺序。

## 兼容性结论与限制

已读取用户提供的《队友对接说明.md》，按其记录的字段和校验器支持能力设计。
仓库是 https://github.com/cloudy-7day/qiuqiuyaoyao 。交付包初稿制作时网络访问失败；本次发布前已成功读取main分支bc0deb1的schema、system.txt、pipeline及测试，并运行原仓库16项测试，全部通过。
交付包放在handoffs/output-results独立目录；未替换根目录schema/prompt，未修改src、server.mjs或public/index.html，也未调用ima或DeepSeek。详细核对结果见docs/仓库兼容性核对.md。
正常样例可通过原仓库validate函数与本包schema的组合检查。资料冲突样例的空content.title会被原校验器拒绝；新schema的三条跟进要求也需要后续同步修改旧测试夹具，不能直接覆盖后就宣称完成集成。

## 设计重点

1. 用户信息只来自问卷输入：已知、显式优先级、未知分开写；没有评分/排序时不伪造。
2. 主交付是给顾客看的图文。画像、策略、证据、演示和跟进供店员使用，不混入复制成稿。
3. “生活尺度翻译”按需触发：能算清楚、有来源、与首要任务相关才使用；不把重量等同效率或疲劳改善。
4. 产品 facts 只能来自本轮指定ima资料；主样例是本地知识库快照的教学设计，实际运行不能继续使用固定S1/I1。
5. 四平台改变结构、篇幅、配图数、行动引导；不只换平台名称。
6. 没有图就如实留空；事实冲突就停止成稿；没有任何来源是上游失败，不造编号。

## 如何合并

先比较、备份原文件，再合并三个核心文件。其他examples和docs是辅助材料，不接入生产提示词，也不覆盖真实检索结果。
不要将本包的schema当成输入schema；不要把expected-output.json包进另一个output对象。外层schema_version/input/output/sources/checks/meta由原程序负责。
所有源文件UTF-8。原项目实际字段、提示词注入方式和校验逻辑由集成人员再核对。

## 离线检查

在本包目录运行：

    node scripts/validate-handoff.mjs

脚本只检查结构、引用集合、图片来源类型、跟进日期、夹具文件、换算以及几个错误反例，不检查产品真实有效性或模型能否稳定遵守提示词。

合并回原项目后，再执行原项目npm test并使用有效的本地凭证做真实联调：

    node cli.mjs run --input examples/output-task.json --output output/handoff-check.json

运行结果由集成人员另行留存。不得把本包理想样例、手工核对或离线测试包装成ima/DeepSeek真实运行记录。

## 图片与产品数据

来源是用户提供的本地知识库文件，未改写原图，文件名为了交接简化，映射保留在source-fixture.json。
这些夹具供本地核对。公开仓库是否可上传二进制图片需先确认使用与传播权限；不能因为有官网链接就推定允许再分发。若不上传图片，可仅保留映射说明，在授权环境下补回后运行检查。
正式作品仍需从比赛指定ima库实时取得匹配产品事实和图片，保留本次来源编号。
