# 华为 PC 门店增长智能体 · 魔搭 Docker 部署包

这是本地项目的独立部署副本，使用 Node.js 24，无 npm 依赖，默认监听 `0.0.0.0:7860`。修改本文件夹不会改变上一级本地服务。后续本地代码变化不会自动同步到这里。

## 网页上传

1. 在魔搭创建或打开 Docker 类型创空间。
2. 上传**本目录里面的文件和子目录**，保持目录结构。上传完成后，空间仓库根目录必须直接看到 `Dockerfile`、`server.mjs`、`package.json`，不能多套一层 `modelscope-upload`。若网页拖拽生成外层目录，调整到仓库根目录再构建。
3. 在创空间的环境变量 / Secrets 设置中填写下表；密钥设为私密变量，不放入代码、README 或 Dockerfile。
4. 保存配置并构建 / 启动，服务端口为 `7860`。打开应用后先检查连接，再运行一条输入任务。

官方入口：[Docker 创空间文档](https://modelscope.cn/docs/studios/docker)、[魔搭官方创空间说明](https://modelscope.cn/skills/modelscope/modelscope-studio)。

## 环境变量

| 名称 | 是否需要填写 | 内容 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 必填，私密 | 你自己的 DeepSeek API Key |
| `IMA_OPENAPI_CLIENTID` | 必填，私密 | 有知识库访问权限的 ima Client ID |
| `IMA_OPENAPI_APIKEY` | 必填，私密 | 与 Client ID 配套的 ima API Key |
| `IMA_KB_NAME` | 建议明确填写 | `任德耀新建华为PC知识库`，必须与账号可访问的知识库名称一致 |
| `DEEPSEEK_MODEL` | 建议明确填写 | `deepseek-flash`，本地已验证的模型；以你账号实际可用模型为准 |
| `DEEPSEEK_BASE_URL` | 可省略 | 默认 `https://api.deepseek.com` |
| `HOST` | 可省略 | Dockerfile 已设置 `0.0.0.0` |
| `PORT` | 可省略 | Dockerfile 已设置 `7860` |

只填写一组 ima 变量，避免同时设置旧别名 `IMA_CLIENT_ID` / `IMA_API_KEY` 导致覆盖。本包不含任何实际凭证，也不会带入你电脑中的用户环境变量。云端默认连接 DeepSeek 官方 API，不使用你电脑上的 localhost 地址。

## 打包范围与部署适配

- 包含运行源码、前端、输入输出契约、提示词、示例、CLI、测试和所需的 ima 官方脚本 / 版本文件。
- 未复制 `.env.local`、用户配置目录、历史输出、图片缓存、临时文件、Git 历史、原始比赛资料。
- Dockerfile 显式复制运行文件，`.dockerignore` 使用允许列表；测试和本说明不进入运行镜像。
- 部署副本支持公网 Host 与反向代理转发的 Host、同源 HTTPS 请求，并允许魔搭页面嵌入应用；原项目仍保留本机访问限制。
- 镜像以 `node` 用户运行；`output/`、`tmp/` 在容器内新建，供本次运行使用。没有配置持久化存储，重建后不保证保留结果。

这是共用演示实例，没有应用内账号隔离；“上次结果”和来源资料由访问者共用。按演示对象设置创空间访问范围。

## 本地验证（可选）

在本目录使用 Node.js 24 执行 `npm test`，不调用远端模型。Docker 可用时执行：

```sh
docker build -t huawei-store-modelscope .
docker run --rm -p 7860:7860 --env-file /path/outside-upload/runtime.env huawei-store-modelscope
```

`runtime.env` 由你在部署目录外准备，只用于本机测试，不上传。线上实际的 ima 权限、DeepSeek 配额、网络和域名转发需要在创空间启动后检查。
