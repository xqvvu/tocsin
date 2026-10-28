# 事件列表按「该目标 × 投递状态」求交

- 状态：已实现（2026-10-28，第 155 轮）
- 相关 backlog：REQ-304
- 相关文档：`docs/prd/post-mvp-planning.md` 方向 4（搜索、过滤与历史排障）

## 问题

值班排障时最常见的问题是「PagerDuty 这条链路是不是挂了」，对应的操作是：事件列表选通知目标
`Pager`，再把投递结果设为「失败」。当前两个条件各自独立命中，返回的是两类事件的并集意义上的交集：

- 条件一（`destinationMatch`）只问「有没有到 Pager 的投递」，任意状态都算
  （`eventDestinationPredicate`）。
- 条件二（`deliveryOutcome`）只问「有没有任何一条失败投递」，不限定目标
  （`eventDeliveryOutcomePredicate`）。

于是「Pager 失败、邮件成功」的告警会被算进「Pager + 失败」的结果里——它确实有一条失败投递，
只是那条失败不是发给 Pager 的。这条假阳性会在渠道故障时把无关告警混进排查队列，而值班此时最需要
的是精确的受影响集合。

core 的注释把这个取舍写成设计意图（`EventDestinationMatchSchema` 的文档注释），但实现与它声称的
「状态维度归 `deliveryOutcome` 管」并不一致：把两个独立 `EXISTS` 相加并不等于「到该目标的投递处于该状态」。

## 用户故事

作为值班工程师，我希望在事件列表同时选择通知目标和该目标的投递状态，以便只看到「发给 PagerDuty 且
发送失败」的告警，而不是所有「碰过 PagerDuty 且别处失败过」的告警。

## 范围

- Events 页 URL 新增 `destinationOutcome`（`succeeded` / `failed` / `pending` / `running` /
  `suppressed`），仅在已选 `destinationId` 时生效；没有 `none`——「该目标没有投递」由
  `destinationMatch=missing` 表达。
- `operations.list` 契约新增可选 `destinationOutcome`（Events 专用），服务层透传到历史仓储。
- 历史仓储把状态并入同一个相关 `EXISTS`：`destination_id = ? AND state = ?`。列表与 `total` 共用该
  谓词，分页与总数不会漂移；一条投递只命中一次，同一目标的重试记录不会让事件被计两次。
- 语义边界：
  - 只要设了 `destinationOutcome`，「到该目标」就被它蕴含，`destinationMatch` 的默认 `delivered`
    不再额外加条件。
  - 手工拼出的 `destinationMatch=missing` + `destinationOutcome` 读作「没有到该目标的该状态投递」，
    因为两者在同一子查询内取反，而不是两个互不相关的谓词。
  - 未选目标时该字段在 URL 边界与请求装配处都会被丢弃（和 `destinationMatch` 的既有规则一致）。
- 筛选面板仅在 Events 作用域、且已选目标并选择「有该目标的投递」时渲染「目标投递结果」控件；
  生效时显示可移除 chip；「重置筛选」清空它。

## 非目标

- 不改变 `deliveryOutcome` 的既有语义（「任意目标上存在该状态的投递」），也不合并两个筛选器。
- 不改变 `destinationMatch` 的既有语义，不引入多选状态。
- 不改投递、路由、加急、静默行为；不新增数据库迁移或索引。
- 不在投递列表新增该维度：投递列表已有精确的 `deliveryState`。

## 验收标准

- `GET /events?destinationId=<pager>&destinationOutcome=failed` 只返回「到该目标的投递失败」的事件；
  同一事件发往其他目标成功不再让它进入结果。
- 同一目标存在「先失败后成功」两条投递时，该事件只出现一次，`total` 只计一次。
- URL 只带 `destinationOutcome` 时被丢弃；带 `destinationMatch=missing` 时也被丢弃，控件不渲染。
- 未知取值在 URL 边界回退为「任意状态」，不抛错；切换该筛选会把两个列表重置到第一页。
- 中英文均显示「目标投递结果 / Destination delivery outcome」，选项为「该目标投递失败」等 SRE 用语。
- 覆盖：仓储层列表 + `total`、oRPC 契约校验、operations service 透传、URL 搜索模型与清洗、
  筛选面板渲染与 chip。

## 架构边界

- 契约：`packages/core/src/operations.ts`（`EventDestinationOutcomeSchema`）、
  `packages/api/src/schemas/operations.ts`（oRPC input）。
- 服务：`apps/console/src/server/operations/operations.service.ts` 透传，领域校验留在边界。
- 持久化：`apps/console/src/infra/sqlite/repositories/history/`，`eventDestinationPredicate` 的
  第三个参数承载状态，列表与计数共用。
- UI：`features/operations/model/operation-search.ts`（URL 状态、清洗、分页重置）、
  `features/operations/api/operations.queries.ts`（请求装配）、
  `features/operations/ui/operation-filters.tsx`（控件与 chip）。
- 无迁移、无新依赖、无新的服务端可部署单元。

## 回滚

移除 URL 字段与契约字段即可；服务端忽略未知字段，历史数据与投递行为不受影响。该字段从不写入数据库。
