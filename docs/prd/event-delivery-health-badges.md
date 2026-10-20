# 事件详情投递健康徽标

## 问题

事件详情页顶部的投递健康徽标只渲染 `succeeded` 与 `failed` 两个计数
（`features/events/ui/event-detail-summary.tsx:41-47`），但同一行右侧的
「通知投递 N 条」统计的是全部投递
（`features/events/ui/event-detail-summary.tsx:79-83`）。当事件存在 `pending`、
`running` 或 `suppressed` 投递时，界面会出现「通知投递 2 条」与「成功 0 / 失败 0」
并列的矛盾，值班人员无法判断是「还没开始投递」还是「投递全部丢失」。

统计函数本身已经按五种状态计数（`features/events/ui/event-detail-stats.ts:5-19`），
缺失的只是展示层。

## 用户故事

作为值班 SRE，我希望事件详情的投递健康徽标覆盖所有投递状态，
这样我不需要打开「投递」标签页逐条核对，就能判断这条告警是仍在排队、
正在发送、已被静默，还是已经失败。

## 范围

- 事件详情摘要区（`EventDetailSummary`）的投递健康徽标。
- 按操作优先级展示非零状态：失败 → 运行中 → 待处理 → 成功 → 已抑制。
- 无投递时展示「无投递」，不再展示无意义的 `0/0`。
- 状态色沿用 `Badge` 语义变体：失败为 `destructive`，进行中为 `secondary`，
  成功与已抑制为 `outline`。
- 中英文文案。

## 非目标

- 不改变投递状态机、重试语义或投递查询 DTO。
- 不新增投递统计接口；数据仍来自 `EventDetail.deliveries`。
- 不调整「投递」标签页的表格内容。
- 不统一其他页面的投递状态徽标。

## 验收标准

1. 事件存在 `pending`/`running`/`suppressed` 投递时，摘要徽标显示对应状态与数量，
   不再出现「成功 0 / 失败 0」而实际有投递的矛盾。
2. 蓝标只展示非零状态；状态顺序固定为失败、运行中、待处理、成功、已抑制。
3. 失败徽标使用 `destructive` 变体；进行中使用 `secondary`；成功与已抑制使用 `outline`。
4. 没有任何投递时显示「无投递」（en-US: `No deliveries`）。
5. 中文界面不出现英文状态枚举。
6. 组件测试覆盖：混合状态、失败态、空投递三种情形，并断言
   「通知投递 N 条」与徽标计数一致。

## 架构边界

纯前端改动，位于 `apps/console/src/features/events/ui/` 与 i18n 消息文件。
不需要迁移、新依赖、oRPC contract 或 service 变更。
