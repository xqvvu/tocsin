# 投递「下次重试」跨天可读性

- 状态：已实现（第 63 轮，NEW-V）
- 相关代码：`apps/console/src/features/operations/ui/retry-timestamp.tsx`、
  `apps/console/src/features/deliveries/ui/deliveries-table.tsx`、
  `apps/console/src/features/deliveries/ui/delivery-pings-table.tsx`、
  `apps/console/src/features/events/ui/event-detail-deliveries-table.tsx`

## 问题

投递列表与加急记录表的「下次重试」列固定使用 `format="time"`，只渲染 `HH:mm`。
退避可能把重试排到数天之后（失败投递、目标不可达、人工暂停），此时裸时间会被
值班工程师读成「今天晚些时候」，从而误判恢复窗口。事件详情内的投递表已经用
`retryTimestampFormat` 按显示时区区分同日/跨天，两个列表页没有跟上，同一份数据
在不同页面呈现不一致。

## 用户故事

作为值班工程师，我在投递列表或加急记录里看到「下次重试」时，能立刻判断它是今天
还是几天后，不需要点开详情或靠标题悬浮提示。

## 范围

- 新增共享 `RetryTimestamp`：按控制台时区与当前时间决定 `time` / `dateTime`。
- 投递列表、加急记录表的「下次重试」列改用该组件；事件详情投递表改为复用同一组件
  （行为不变，消除三处重复实现）。
- 投递列表表头由「下次」改为「下次重试」，与事件详情、加急记录表一致。
- `AppIntlProvider` 接受可选 `now`，让依赖「今天」的渲染在测试中可确定。

## 非目标

- 不改变重试时间本身的存储、计算或调度语义。
- 不改变 `firedAt` 等历史时间列的既有格式。
- 不引入相对时间（「3 分钟后」）或定时刷新。

## 验收标准

- 同日重试只显示 `HH:mm`；跨天（含非法时间值）显示日期与时间。
- 跨天判断使用控制台时区：同一 UTC 瞬时在 `Asia/Shanghai` 可能属于同一天，必须显示时间。
- 投递列表表头为「下次重试 / Next retry」。
- 三处「下次重试」渲染走同一组件，事件详情原有测试保持通过。

## 架构边界

纯前端展示层改动：`features/operations/ui` 新增一个无状态组件，三个表格消费它；
不涉及 oRPC、service、SQLite 或迁移。`retryTimestampFormat` 继续留在
`features/operations/model/operation-format.ts`，其单元测试不变。
