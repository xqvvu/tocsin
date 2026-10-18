# 投递详情页重试闭环

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/release/mvp-rc-checklist.md:152`；backlog `REQ-38`。

## 一句话结论

失败投递的详情页工具栏新增「重试投递」按钮，直接复用列表页的同一条
`operations.retryDelivery` 语义：调用后投递重新入队、详情与列表一起刷新。
非失败状态不显示该按钮，避免用户点了才收到状态错误。

## 1. 问题

RC checklist 把「Delivery detail 展示 … retry 操作」标为已完成
（`docs/release/mvp-rc-checklist.md:152`），但代码里 retry 只存在于列表行操作：

- 列表只在 `state === "failed"` 时渲染重试图标
  （`apps/console/src/features/deliveries/ui/delivery-actions.tsx:25-38`）；
- 详情页工具栏只有返回列表的链接，没有任何投递操作
  （`apps/console/src/features/deliveries/ui/delivery-detail-page.tsx:47-56`）。

值班工程师的典型路径是先打开投递详情，看 `last error`、attempts 和渲染后的
payload，再决定是否重试。现在必须退回列表、重新找到这一行，才能点重试；
筛选或分页一变，还可能找不到原记录。

服务端语义已经齐备：

- contract 声明 `retryDelivery`（`packages/api/src/contract/operations.ts:49-53`）；
- service 直接委托仓储（`apps/console/src/server/operations/operations.service.ts:71-73`）；
- 仓储只允许失败态重试，否则抛 `InvalidDeliveryStateError`
  （`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:417-419`）。

因此这是纯前端切片，不需要新增 procedure、schema 或持久化变更。

## 2. 用户故事

作为值班工程师，我在投递详情页看完最近错误与尝试记录后，希望就地重试这条投递，
并在同一页看到它重新入队，不必退回列表重新定位。

## 3. 范围

- 新增 `DeliveryRetryButton`（`features/deliveries/ui/delivery-retry-button.tsx`）：
  - 仅在 `detail.job.state === "failed"` 时渲染；
  - 点击调用 `operations.retryDelivery({ id })`；
  - 成功后提示「投递已重新入队」并 `invalidateOperations()`，让详情与列表一起刷新；
  - 失败时提示「重试失败」并附服务端可读原因；
  - 请求进行中禁用按钮，防止重复点击。
- 详情页工具栏接收 `detail`，在返回链接之前渲染该按钮。
- 中英文案新增 `deliveries.detail.retry.action/successTitle/failureTitle`。
- 新增组件测试：失败态重试成功、非失败态隐藏、请求中禁用、服务端拒绝时错误提示。

## 4. 非目标

- 不改变 `retryNow` 的语义、状态机、`max_attempts` 调整或 `next_attempt_at` 计算。
- 不新增「批量重试」入口（backlog `REQ-18` 单独处理）。
- 不在详情页自动触发 worker；重试只负责重新入队，发送仍由 worker 周期执行。
- 不对 `succeeded` / `pending` / `running` / `suppressed` 状态提供强制重试。
- 不新增 oRPC procedure、contract、数据库迁移或依赖。

## 5. 验收标准

1. 打开失败投递详情页，工具栏出现「重试投递」按钮。
2. 点击后调用 `operations.retryDelivery` 且参数为当前投递 ID。
3. 成功后出现成功提示，并触发 operations 查询失效（详情状态刷新为 `pending`）。
4. 请求进行中按钮禁用，重复点击不会重复调用。
5. 服务端拒绝（例如状态已变化）时出现错误提示，按钮恢复可用。
6. 非失败投递详情页不渲染该按钮。
7. 中英文案齐全，`vp check` 与 console 测试全绿。

## 6. 架构边界

- `apps/console/src/features/deliveries/ui/delivery-retry-button.tsx`：新增 feature UI 组件，
  通过 `useOperationMutations` 调用 oRPC，不直接访问 `#/server/**`。
- `apps/console/src/features/deliveries/ui/delivery-detail-page.tsx`：工具栏传入已有详情数据。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`：新增三条文案。
- `apps/console/src/features/deliveries/ui/delivery-retry-button.test.tsx`：组件测试。

无 contract / service / repository / schema 变更；不改变投递、路由或 auth 语义。
