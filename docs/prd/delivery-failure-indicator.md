# 顶栏投递失败指示器

状态：**已实现（第 87 轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` REQ-166。

## 一句话结论

在控制台顶栏常驻「最近 24 小时投递失败」徽标，值班工程师在任何页面都能看到失败信号，
并一键进入已套用相同筛选的 Deliveries 列表。

## 1. 问题

顶栏目前只有暂停与静默两个全局指示器
（`apps/console/src/shell/dashboard-header.tsx:23-26`）。投递失败只存在于 Deliveries 列表，
值班工程师停留在 Events、Routes、Destinations 或 Settings 页面时，无法知道最近是否有告警
没有送达；「上游安静」与「告警被丢在路上」在顶栏看起来完全一样。

`operations.list` 已经支持 `deliveryState=failed` 与相对时间窗，且 `total` 统计的是全部匹配
记录而不是当前页（`apps/console/src/server/operations/operations.service.ts:26-62`），
缺的只是一个跨页可见的入口。

## 2. 用户故事

作为值班工程师，我希望在任意控制台页面都能看到最近 24 小时是否有投递失败；点击徽标后，
Deliveries 列表已经套用「失败 + 最近 24 小时」筛选，不需要再手动选条件。

## 3. 范围

- 顶栏新增投递失败指示器，复用 `operations.list`，请求
  `{ limit: 1, deliveryState: "failed", range: "24h" }`，读取 `deliveries.total`。
- `total > 0` 时显示 destructive 徽标，文案「投递失败：{count} 条」；数量为 0、加载中或
  查询失败时隐藏。
- 徽标链接到 `/deliveries?deliveryState=failed&range=24h`。
- 客户端每 60 秒刷新一次，`staleTime` 30 秒。
- 徽标 tooltip 说明统计口径：最近 24 小时内创建、当前仍是失败状态的投递。

## 4. 非目标

- 不新增服务端 summary endpoint、DTO 或数据库迁移。
- 不按目标、路由或失败原因拆分计数（失败原因聚合见 REQ-45）。
- 不在徽标上提供重试、静默或跳转到单条投递的操作。
- 不改变 Deliveries 列表现有的筛选与分页语义。

## 5. 验收标准

1. `deliveries.total > 0` 时显示徽标，可访问名称包含失败数量。
2. `deliveries.total = 0`、查询加载中、查询失败时都不显示徽标。
3. 徽标链接指向 `/deliveries?deliveryState=failed&range=24h`。
4. 徽标在任意渲染 dashboard 顶栏的页面出现，不依赖当前路由。
5. 查询失败不会被当作「有失败」展示，避免把一次瞬时请求错误变成第二重告警。
6. 中英文 i18n 键齐平，中文使用 SRE 运维语言。

## 6. 架构边界

- `apps/console/src/features/operations/api/operations.queries.ts`：新增
  `failedDeliveriesQueryOptions()`，仅复用既有 procedure，不新增服务端能力。
- `apps/console/src/features/deliveries/ui/delivery-failure-indicator.tsx` 与其测试：
  展示组件，不读路由状态、不修改数据。
- `apps/console/src/shell/dashboard-header.tsx`：挂载指示器；顶栏只承载 app chrome。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`：新增
  `deliveries.failureIndicator.*`。

无数据库 schema 变更，无新增运行时依赖，不改变投递 / 路由 / auth 语义。
