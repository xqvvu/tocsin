# Settings 运行时与生效参数只读投影

- 状态：已实现（REQ-84 + REQ-216 合并切片）
- 日期：2026-10-22
- 关联：`docs/planning/iteration-backlog.md` 的 REQ-84、REQ-216

## 问题

值班时需要确认「现在跑的是哪个版本、Node/SQLite 是什么、出站超时和 worker 参数到底生效成多少」。
这些值目前只在启动日志里出现一次（`apps/console/src/server.ts:13-14`），或者散落在环境变量里；
Settings 页面只有语言、时区、Raw payload 留存三项可编辑设置，没有任何只读运行时信息。
排障时运维只能去翻容器日志或执行 `docker exec`，与「自托管、单进程、SQLite-first」的产品定位不匹配。

## 用户故事

作为自托管 Tocsin 的值班运维，我希望在 Settings 页面直接看到当前进程的版本与生效运行参数，
以便在排障和变更复盘时确认实际运行状态，而不必登录宿主机翻日志。

## 范围

- 新增只读 oRPC 过程 `settings.getRuntime`，输出白名单 DTO：
  - 进程信息：Tocsin 版本、运行环境、Node 版本、平台/架构、SQLite 驱动与版本。
  - 生效限制：出站超时、Webhook 请求体上限、worker 间隔/批量/超时回收。
  - 日志：格式与级别。
- Settings 页 `UI` 标签在运营概览下方新增「运行时与生效参数」面板，只读展示上述字段。
- SQLite 版本每次调用都从活动连接读取，不在启动时缓存，避免展示过期信息。
- 路由 loader 预取该查询，配置刷新时一并失效。

## 非目标

- 不新增可编辑的运行参数；修改仍通过环境变量与重启完成。
- 不展示 `BETTER_AUTH_SECRET`、数据库绝对路径、Token、密码或任何环境变量原文。
- 不新增健康检查端点、不改变 `/api/health` 的公开形状。
- 不引入进程指标（CPU/内存）或 Prometheus 采集。

## 验收标准

- 已登录 dashboard 的请求可以拿到固定字段集合的 DTO；未登录请求返回 UNAUTHORIZED。
- DTO 字段集合是白名单：上游对象新增字段不会自动透出（服务测试用多余字段验证）。
- SQLite 版本来自 `store.sqliteVersion()`，连续调用会重新读取。
- Settings 页在 1280×900 视口下无需横向滚动即可看到全部 12 个字段；字段值过长时省略并保留 `title`。
- 中英文 i18n key 保持一一对应，文案不出现句号结尾的说明句。

## 架构边界

- 契约与输出 schema：`packages/api/src/schemas/settings.ts`、`packages/api/src/contract/settings.ts`。
- 服务：`apps/console/src/server/runtime/runtime-information.service.ts`（显式依赖：store 的
  `sqliteVersion`、生效限制、日志配置、系统信息读取函数），类型在同名 `.service.types.ts`。
- 装配：`server/runtime/container.ts` 新增 `createRuntimeInformationService()`；环境变量只在容器层读取。
- 入口：`server/orpc/features/settings/router.ts` 用 `withDashboardService` 注入服务，处理器只做委派。
- 前端：`features/configuration/api/configuration.queries.ts` 的 query options、
  `features/configuration/ui/settings-runtime-panel.tsx`，路由 loader 预取。
- 无数据库迁移、无 schema 变更、无新依赖。

## 安全与隐私

- 服务逐字段组装 DTO，环境变量对象不进入返回值。
- 不返回文件系统路径、密钥、Token、Header 值。
- 契约为 dashboard 私有过程，沿用现有 dashboard auth 错误映射。

## 回滚

删除该过程与面板即可恢复原状；无持久化副作用，旧客户端不会因该字段缺失而失败。
