# Settings 只读投影缓存失效契约

## 问题

设置页的「刷新」以及配置导入成功后的失效逻辑逐项手写了 6 个 query key，漏掉了存储健康
投影。存储面板因此在导入配置或修改设置后继续展示旧的数据库体积与表计数，而
`docs/prd/settings-storage-health.md` 明确要求面板随设置页查询缓存刷新。

证据：

- 旧实现逐项失效 settings / runtime / worker / source / destination / route，
  漏掉 `storageHealthQueryKeys`（`apps/console/src/features/configuration/api/configuration.mutations.ts:21-29`）。
- 存储健康 key 已定义并用于面板查询
  （`apps/console/src/features/configuration/api/configuration.queries.ts:25-34`）。
- 既有测试把漏登记固化成了期望值
  （`apps/console/src/features/configuration/api/configuration-query-invalidation.test.tsx:60-67`）。

## 用户故事

作为自托管 Tocsin 的值班工程师，我在设置页修改设置或导入配置并刷新后，希望所有只读面板
（运行时信息、worker 健康、存储健康、告警源、目标、路由）都展示最新状态，而不需要手动
刷新浏览器。

## 范围

- 在 `features/configuration/api/` 内新增可枚举的只读投影失效契约
  `configurationReadOnlyQueryKeys`。
- `invalidateConfiguration` 遍历该契约，不再逐项手写。
- 契约测试：`configuration.queries.ts` 导出的每个 `*QueryKeys` 都必须出现在契约中，
  漏登记即失败；行为测试同时断言实际失效调用与契约一致。

## 非目标

- 不修改 DTO、oRPC 契约或服务端查询语义。
- 不新增轮询或实时刷新机制。
- 不改变列表页既有的失效范围与顺序语义。

## 验收标准

- Settings 刷新后 `storage-health` 查询被失效并重新获取。
- 向 `configuration.queries.ts` 新增只读投影 query key 却未登记契约时，测试失败。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 仅涉及前端 feature `api/` 层；无服务端、SQLite、schema 或持久化变化。
- 不引入新的运行时依赖。
