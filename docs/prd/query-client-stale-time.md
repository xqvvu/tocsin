# 查询缓存默认新鲜期（QueryClient staleTime）

- 状态：已实现（第 77 轮）
- 关联 backlog：NEW-BO

## 问题

TanStack Start 的路由 loader 在服务端预取页面数据，例如 Events 页同时预取
告警源、通知目标与 `operations.list`（`apps/console/src/routes/_dashboard.events.tsx:17-23`）。
但控制台的 `QueryClient` 使用 TanStack Query 的零默认值
（`apps/console/src/router.tsx:11`，`new QueryClient()`），任何一次组件重新挂载
（hydration 之后的挂载、路由重入、条件渲染重建）都会把 loader 刚取回的数据判定为
过期并立即再请求一次。`operations.list` 每次都会执行事件/投递计数聚合
（`apps/console/src/features/operations/api/operations.queries.ts:62-73`），重复请求的代价
高于普通列表查询。15 秒默认值让 loader 结果在首屏交互期间保持权威，同时仍允许短时间后
的重新挂载获取 worker 的最新进度。

## 用户故事

作为值班 SRE，我打开事件或投递列表时，希望首屏直接使用服务端已经取好的数据，
而不是在页面稳定后再看到一次重复加载与额外的查询压力。

## 范围

- 新增 `apps/console/src/lib/query-client.ts`，集中创建 `QueryClient` 并设置
  `defaultOptions.queries.staleTime = 15_000`。
- `apps/console/src/router.tsx` 改用该工厂。
- 保留各查询自身的 `staleTime` 覆盖（如 `pendingDeliveriesQueryOptions` 的 15s、
  `recentEventsQueryOptions` 的 30s），行为不变。
- 新增单元测试，断言默认新鲜期存在、窗口内不 stale、失效后 stale。

## 非目标

- 不调整各业务查询的 `staleTime` 取值，不引入轮询或实时推送。
- 不修改 loader 预取策略、路由 `defaultPreloadStaleTime` 或 SSR 集成方式。
- 不新增依赖、不改 DTO、不改数据库。

## 验收标准

1. 新建的 `QueryClient` 默认 `queries.staleTime` 为 15 秒。
2. 刚由 loader 写入的数据在 15 秒内不会被判定为 stale；超过窗口后判定为 stale。
3. 显式 `invalidateQueries` 后立即变为 stale，写操作后的刷新语义不变。
4. `vp check`、`vp run -r test`、`vp run -r build` 通过；隔离实例打开 Events 页时，
   loader 预取的查询在客户端缓存中带有 15 秒新鲜期，且页面加载后没有额外的
   `operations.list` 请求（浏览器实测，见第 77 轮日志）。

## 架构边界

- 查询缓存属于控制台客户端/SSR 共享的基础设施，放在 `apps/console/src/lib/`，
  不接触服务端 store、鉴权或持久化。
- 数据新鲜期是客户端策略，不改变 oRPC 契约与 service 语义；所有写操作仍通过
  `invalidateQueries` 精确失效。
