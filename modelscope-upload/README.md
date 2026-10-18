# 门店增长智能体 · 整合部署包

由 scripts/package-modelscope.mjs 从当前源码生成，禁止在此目录手工维护第二套代码。
上传本目录内的文件和子目录到魔搭 Docker 创空间根目录。Dockerfile 必须位于仓库根目录。
使用 Node.js 24，监听 0.0.0.0:7860；构建时安装锁定依赖并编译 React。
应用入口 /scenario/，单平台表单 /。

必填私密环境变量：DEEPSEEK_API_KEY。默认 KNOWLEDGE_SOURCE=local，读取随包提供的 knowledge/，不调用 ima。
建议明确填写 DEEPSEEK_MODEL=deepseek-flash。仅主动切回 KNOWLEDGE_SOURCE=ima 时才需要配置 ima 凭证。
DEEPSEEK_BASE_URL 默认 https://api.deepseek.com，HOST/PORT 已在 Dockerfile 中设置。
不要上传 .env.local 或将 SHADOW_ENV_FILE 设为你电脑上的路径。

包含用户提供的知识库原始资料和产品图片；不包含凭证、本地依赖、缓存、历史生成结果。运行时按产品目录查找并引用配图。
没有配置持久化存储；分析确认记录在进程内存中，重启后需要重新理解。
实例没有多用户账号隔离，按团队演示对象设置访问范围。
代码、提示词和构建产物经过本地测试不等于魔搭已部署；请上传后检查连接和生成。
