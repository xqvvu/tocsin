# 投递详情排障可读性

状态：已实现（2026-10-18）

## 问题

投递详情页是值班工程师定位「为什么没送达」的主要入口，但当前只有原始时间戳和
被截断的错误文本：

- 摘要页与尝试记录只展示 `createdAt` / `startedAt` / `finishedAt` 的原始值，
  不展示排队、发送与端到端耗时，无法快速区分「上游安静」「队列积压」「目标慢」
  与「重试退避」（`delivery-summary-tab.tsx:10-84`、`delivery-attempts-table.tsx:23-47`）。
  投递 DTO 已经包含所需时间字段（`packages/core/src/operations.ts:107-126`、
  `packages/core/src/delivery/delivery.ts:36-38`）。
- 尝试记录把响应体压缩到 120 字并塞进 `title` 提示（`operation-format.ts:49-56`、
  `delivery-attempts-table.tsx:56,75-77`）。长错误与结构化响应体无法阅读、无法复制，
  而服务端 DTO 已提供完整且经键值与高置信值形态脱敏的 `error` / `responseBody`
  （`packages/core/src/operations.ts:109-116`）。脱敏不承诺覆盖无前缀裸 token 或
  generic webhook path/query 中的 secret。

## 用户故事

- 作为值班工程师，我希望在投递详情直接看到「排队等了多久、发送花了多久、端到端多久」，
  以便判断延迟来自队列、目标系统还是重试退避。
- 作为值班工程师，我希望逐次尝试看到单次发送耗时，以便定位某一次超时或慢响应。
- 作为值班工程师，我希望打开任意一次尝试查看完整错误与响应体，并能一键复制，
  以便贴到工单或与上游系统核对，而不是只能看被截断的 120 字。

## 范围

- 投递详情摘要页新增：创建时间、结束时间、排队耗时、发送耗时（已完成尝试累计）、
  端到端耗时。
- 尝试记录表新增「耗时」列（`finishedAt - startedAt`）。
- 尝试记录的错误/响应单元格改为可点击入口，打开对话框展示：
  - 尝试序号、状态、HTTP 状态、开始/结束时间、耗时；
  - 完整错误文本（保留换行）；
  - 完整响应体（合法 JSON 时格式化高亮，否则按原文展示）；
  - 错误与响应体各自的复制按钮。
- 耗时格式化统一走一个纯函数：亚秒 `850ms`、秒级 `1.2s`、分钟级 `3m 12s`、
  小时级 `1h 04m`、天级 `2d 03h`。
- 修正 attempt 时间戳来源（Q-9）：原实现把同一批次的 `now` 同时写进
  `started_at` 与 `finished_at`，耗时恒为 0。执行器改为接收实时时钟，
  attempt 的起止时间反映真实发送区间；重试退避也以真实完成时间为基准。

## 非目标

- 不新增服务端字段、procedure、schema 或迁移；全部基于现有 `DeliveryDetail` DTO 派生。
- 不改变投递、重试、抑制或加急语义。
- 不引入图表、时间线可视化或新的格式化依赖。
- 不改变列表页与筛选行为。

## 验收标准

1. 摘要页展示创建时间、结束时间、排队耗时、发送耗时、端到端耗时；缺失数据时显示 `-`。
2. 排队耗时等于首次尝试 `startedAt - job.createdAt`；发送耗时为所有已完成尝试
   `finishedAt - startedAt` 之和；端到端耗时仅在 `job.finishedAt` 存在时显示。
3. 尝试记录表展示每次尝试的耗时；进行中的尝试显示 `-`。
4. 点击错误/响应单元格打开对话框，完整展示该次尝试的错误与响应体；
   合法 JSON 响应体格式化展示；两者均可复制。
5. 时间解析失败、结束时间早于开始时间等异常数据不得显示负数或 `NaN`，统一回退为 `-`。
6. attempt 的 `started_at` / `finished_at` 来自真实发送时钟；同一批次内不同投递
   不再共享同一组时间戳，退避以真实完成时间计算。
7. 纯函数与组件均有测试覆盖；`vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 耗时派生逻辑放在 `apps/console/src/features/deliveries/model/delivery-diagnostics.ts`，
  为环境无关纯函数，只依赖 DTO 类型与格式化工具。
- 通用耗时格式化放在
  `apps/console/src/features/operations/model/operation-format.ts`。
- 尝试详情对话框放在 `features/deliveries/ui/delivery-attempt-detail-dialog.tsx`，
  只读取已脱敏 DTO，不发起请求、不接触服务端模块。
- 服务端只调整时间来源：`DeliveryExecution.execute` 增加可选实时时钟，
  `DeliveryRepository.markSucceeded/markFailed` 接受可选 `startedAt` 并持久化。
  无 oRPC contract、schema 或迁移变更，投递状态机与重试语义不变。
