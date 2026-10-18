# 场景模块

本模块属于根目录的唯一应用，不再独立启动另一套后端。请在仓库根目录运行 `pnpm build`、`pnpm test` 和 `scripts/start-local.ps1`。

`src/` 是 React 页面，`shared/` 是两端共享契约和筛选规则，`server/` 提供理解与确认逻辑，由根目录 `src/scenario-service.mjs` 接入。独立参考版的旧入口已退役。
