# 配置编辑对已排队投递的影响披露

## 状态

- 状态：已实现（REQ-196）
- 范围：通知目标编辑对话框、路由内联编辑面板
- 迁移：无

## 问题

Tocsin 在接入时决定路由并创建投递，但投递的执行配置在 worker 认领时才读取：

- worker 认领排队投递时只校验通知目标与路由仍然启用
  （`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:219-238`）。
- 发送时重新读取通知目标的当前配置
  （`apps/console/src/server/deliveries/delivery-execution.ts:82-100`）。

因此运维在编辑配置时会遇到两个反直觉后果：

1. 修改通知目标的端点、模板、请求头或签名后，**已经排队的投递会按新配置发送**，
   而不是按入队时的配置。
2. 从路由中移除某个通知目标后，**已经排队的投递仍会发往该目标**；路由规则变更
   也不会让排队投递重新匹配。

当前两个编辑面都没有任何提示：通知目标编辑对话框只有「密钥字段留空时保留当前已存储的值」
（`apps/console/src/features/destinations/ui/destination-edit-dialog.tsx:97-122`），
路由编辑面板只有条件说明（`apps/console/src/features/routes/ui/route-forms.tsx:127-176`）。
值班工程师容易把「保存配置」理解为只影响未来事件。

## 用户故事

作为值班工程师，我在修改通知目标或路由时，希望看到还有多少投递在排队、这些投递会
如何使用我的改动，从而避免在故障处理中误以为改动会撤回或保留旧行为。

## 范围

- 在通知目标编辑对话框中，当该目标存在排队投递时，显示：
  - 排队投递数量；
  - 一句影响说明：保存后排队投递会按最新配置发送（端点、模板、请求头、签名）。
- 在路由内联编辑面板中，当该路由存在排队投递时，显示：
  - 排队投递数量；
  - 一句影响说明：排队投递不会重新匹配，移除目标也不会撤回已排队投递。
- 复用 `pendingDeliveriesQueryOptions` 的只读计数（`deliveries.total`，`deliveryState=pending`），
  仅在编辑面打开时查询，15 秒缓存。
- 计数与说明是建议性信息：加载中、失败或数量为 0 时不渲染，且绝不阻断保存。

## 非目标

- 不持久化发送时的配置快照，不做配置版本或 diff。
- 不取消、暂停或重新匹配已排队投递，不改变投递、路由或 worker 语义。
- 不在新建表单中展示（新建时不存在排队投递）。
- 不新增 schema、迁移、服务端 DTO 或 oRPC procedure。

## 验收标准

1. 通知目标编辑对话框在排队投递数大于 0 时显示数量与影响说明；为 0、加载中或查询失败时
   不显示任何内容，保存按钮不受影响。
2. 路由内联编辑面板同样在排队投递数大于 0 时显示数量与影响说明，其余状态不渲染。
3. 中英文案齐全，中文使用 SRE 术语（通知目标、路由、投递、排队）。
4. 组件测试覆盖：有排队投递时渲染说明与数量；数量为 0 时隐藏；查询失败时隐藏。
5. 不修改 server、repository、schema 或迁移。

## 架构边界

- 前端：`features/destinations/ui`、`features/routes/ui`、`features/operations/ui` 与 i18n 文案。
- 复用 `QueuedDeliveriesNotice`（`features/operations/ui/queued-deliveries-notice.tsx`），
  为其增加可选说明与「空计数隐藏」开关；停用确认框的既有行为保持不变。
- 无 server-only 导入、无新依赖、无客户端全局 API、无迁移。
