# 事件详情投递表按操作优先级排序

## 问题

事件详情页顶部的投递健康徽标已按操作优先级展示失败 → 运行中 → 待处理 → 成功 → 已抑制
（`apps/console/src/features/events/ui/event-detail-summary.tsx:26-40`），但同一页面的
「投递」表仍按服务端返回的 `created_at` 升序渲染
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:172`、
`apps/console/src/features/events/ui/event-detail-deliveries-table.tsx:50-81`）。

当一条事件产生多条投递时，值班人员点开详情后先看到的是最早创建、通常已经成功的投递，
真正需要处理的失败投递被挤到列表下方；徽标说「失败 1」，表格却要滚动才能找到。
摘要与明细的排序语义不一致，延长了排障的第一步。

## 用户故事

作为值班 SRE，我希望事件详情的投递表把失败、运行中、待处理的投递排在前面，
这样我从摘要徽标点进「投递」标签页时，第一眼看到的就是需要处理的那一条，
而不必在已成功的投递里逐行寻找。

## 范围

- 事件详情「投递」标签页的表格行顺序（`EventDetailDeliveriesTable`）。
- 按操作优先级排序：失败 → 运行中 → 待处理 → 成功 → 已抑制。
- 同状态投递保持服务端返回顺序（`created_at` 升序），即稳定排序。
- 优先级常量与摘要健康徽标共用同一处定义，避免两处顺序漂移。

## 非目标

- 不改变服务端查询排序、投递 DTO、分页或索引。
- 不改变投递状态机、重试语义或「重试」按钮的可用条件。
- 不新增可点击的列排序、URL 排序参数或表格工具栏。
- 不调整投递列表页（Deliveries）的排序。

## 验收标准

1. 混合状态的投递表按失败、运行中、待处理、成功、已抑制的顺序渲染行。
2. 同一状态的投递保持输入数组中的相对顺序。
3. 排序不修改传入的 `deliveries` 数组（组件纯读取）。
4. 摘要徽标与投递表使用同一优先级常量；新增状态时只需改一处。
5. 单元测试覆盖：优先级比较、稳定排序、输入数组不被修改；组件测试断言
   混合状态下表格首列（目标名称）的实际渲染顺序。
6. 中文界面无新增文案；空态与重试行为不变。

## 架构边界

纯前端改动，位于 `apps/console/src/features/events/model/delivery-priority.ts`（新增）
与 `apps/console/src/features/events/ui/`。不涉及迁移、新依赖、oRPC contract、
service 或投递语义变更。
