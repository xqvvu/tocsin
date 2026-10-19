# 电话加急记录的操作审计字段

## 状态

已实现，2026-10-19（backlog `REQ-53`）。

## 问题

投递详情页的「电话加急」表格只展示呼叫对象、状态、触发方式、尝试次数、创建时间和
最近错误（`apps/console/src/features/deliveries/ui/delivery-pings-table.tsx:28-71`）。
`OncallPing` DTO 已经带有三个关键审计字段，但页面没有渲染：

- `initiatedBy`：手动加急时触发该操作的值班用户；
- `firedAt`：电话实际拨出的时间；
- `nextAttemptAt`：下一次重试的预定时间。

结果是值班人员在复盘「谁在什么时候按了加急、电话到底拨出去没有、失败后何时重试」时，
只能看到创建时间和错误文本。创建时间不等于拨出时间（加急任务可能排队），
重试计划则完全不可见；手动与自动加急在页面上也看不出操作人。

## 用户故事

作为值班 SRE，我希望在投递详情的加急表格里直接看到触发人、实际呼叫时间和下次重试
时间，以便在事故复盘中确认加急是否真正执行、由谁发起，以及失败后是否需要人工介入。

## 范围

- `DeliveryPingsTable` 的「触发方式」单元格在手动加急时追加触发人（稳定用户 ID，
  mono 小字、可截断并带 title）。
- 新增「呼叫时间」列，展示 `firedAt`；未拨出时显示统一占位符。
- 新增「下次重试」列，展示 `nextAttemptAt`；终态或排队中显示统一占位符。
- 中英文文案新增两个列头与一个触发人文案。
- 新增 `delivery-pings-table.test.tsx`：手动加急展示触发人与三个时间字段、自动加急
  展示占位符、空列表展示空态。

## 非目标

- 不改变加急创建、重试、状态机或 worker 语义。
- 不新增 oRPC procedure、service、repository、DTO 字段或数据库迁移。
- 不把用户 ID 解析为姓名/邮箱（当前没有通用的用户目录投影，另行评估）。
- 不改动投递详情其它标签页或投递列表。

## 验收标准

- 手动加急行显示「手动」以及 `initiatedBy` 的值；`initiatedBy` 为空时不显示触发人。
- 自动加急行不显示触发人。
- `firedAt` 非空时「呼叫时间」显示该时间；为空时显示 `—`。
- `nextAttemptAt` 非空时「下次重试」显示该时间；为空时显示 `—`。
- 没有加急记录时仍显示原有空态文案。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 纯前端 feature 改动：`features/deliveries/ui` + i18n。
- 数据来自既有 `DeliveryDetail.pings`（`packages/core/src/operations.ts:135`），
  不新增服务端读取路径，不触碰 secret、auth、投递或路由语义。
- 表格继续使用 shadcn `Table` 与既有 `OperationTimestamp`，不引入新组件体系。
