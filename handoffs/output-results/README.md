# 输出结果同学交付包

本目录是待合并的输出模块交付，不会自动替换项目根目录的运行配置。

先读 [交付说明](README-交付说明.md) 和 [仓库兼容性核对](docs/仓库兼容性核对.md)。

核心文件：
- [输出结构](contracts/output.schema.json)
- [系统提示词](prompts/system.txt)
- [手写理想结果](examples/expected-output.json)

四平台样例及异常样例均为人工设计目标，不是 ima / DeepSeek 真实运行记录。

独立文件检查：`node handoffs/output-results/scripts/validate-handoff.mjs`

原仓库校验器兼容性检查：`node handoffs/output-results/scripts/check-repository-compatibility.mjs`

本次只新增交付目录，未将新 schema/prompt 接入现有程序。资料冲突样例的空标题会被当前校验器拒绝；新契约要求三条跟进，旧测试的空跟进需要在后续集成时更新。详见核对说明。
