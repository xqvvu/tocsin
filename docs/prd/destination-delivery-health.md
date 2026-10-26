# 通知目标投递健康（REQ-12）

## 问题

通知目标列表（`apps/console/src/features/destinations/ui/destinations-section.tsx`）目前只展示目标身份、运维配置、路由覆盖和启用状态。运维想知道「这个目标现在还在正常投递吗」时，必须跳到投递列表再按目标筛选：

- 目标行没有任何最近投递结果（`packages/core/src/destination/destination.ts` 的 `DestinationListItemSchema` 只有摘要与运维配置）。
- 投递的终态、排队积压和近期失败次数都只存在于 `deliveries` 表，列表页不读。
- `AGENTS.md` 的 UI Direction 已明确：最近投递健康可以进入通知目标表，但前提是先有服务端 summary DTO。

结果是一次故障排查要在两个页面之间来回切换，且「目标停用 / 目标配置错误 / 目标暂时抖动」在列表上看起来完全一样。

## 用户故事

作为值班 SRE，我在通知目标列表就能看到每个目标最近一次成功、最近一次失败、当前排队量与近 24 小时失败次数，从而在不离开列表的情况下判断某个目标是否已经失效。

## 范围

- `packages/core/src/destination/destination.ts`
  - 新增 `DestinationDeliveryHealthSchema` 与 `DESTINATION_HEALTH_RECENT_FAILURE_HOURS = 24`。
  - `DestinationListItemSchema` 增加可选 `deliveryHealth`：仅列表投影填充，创建/更新响应不带。
- `apps/console/src/infra/sqlite/repositories/history/`
  - `history.interface.ts` 增加 `destinationDeliveryHealth({ since })` 与行类型。
  - `history.repository.ts` 用一次 `GROUP BY destination_id` 聚合，不按目标逐行查询。
- `apps/console/src/server/destinations/`
  - `destination.service.ts` 的 `listDestinations()` 并行读取目标与聚合；`now` 时钟可注入，用于固定统计窗口。
- `apps/console/src/features/destinations/ui/`
  - 新增 `destination-delivery-health-cell.tsx`，在目标表新增「投递健康」列。
- i18n 中英文键（`destinations.health.*`、`destinations.table.headers.deliveryHealth`）。

## 非目标

- 不改变投递、重试、worker 的任何语义。
- 不新增数据库表、列或索引，不写迁移。
- 不改变创建/更新 DTO；健康数据只属于列表查询。
- 不做图表、趋势线或按目标的历史曲线。
- 不在浏览器端重复计算；聚合只在服务端发生一次。

## 验收标准

1. `listDestinations()` 返回的每一项都带 `deliveryHealth`：最近成功时间、最近失败时间、排队/发送中数量、窗口内失败数量。
2. 从未有过投递的目标返回全零/空健康值，列表显示「暂无投递」而不是空白。
3. 创建或更新目标的响应不包含 `deliveryHealth`，旧客户端仍能解析列表项。
4. 被抑制（`suppressed`）的投递不计入排队量或失败数。
5. 失败时间早于统计窗口时，仍作为「最近失败」展示，但不计入窗口内失败数。
6. 仓储测试覆盖多状态聚合、窗口边界与无历史目标；组件测试覆盖有数据/无数据/字段缺失三种渲染。

## 架构边界

- DTO 属于 `@tocsin/core` 的 destination 模块，环境中立，可直接被 UI 使用。
- 聚合属于 history 仓储的只读查询（跨 `deliveries` 表），不进入 destination 仓储。
- 业务装配在 `DestinationService`，入口仍是既有的 `destinations.list` oRPC 过程，不新增入口或客户端查询。
- 聚合是单次 `GROUP BY`，依赖历史保留策略限制表规模；不引入缓存或后台任务。
