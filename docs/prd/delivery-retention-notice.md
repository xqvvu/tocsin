# 停用目标与路由的投递滞留警示

> 状态：已交付（PR #111）。以下「问题」段保留交付前的现状记录。

## 问题

- 投递 worker 只领取「目标已启用且路由已启用」的 pending 投递
  （`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:225-226`），
  但入队时不检查启用状态（`:144`）。
- 因此停用通知目标或路由后，命中的事件仍会创建 pending 投递，worker 却永远不会领取；
  这些投递会静默滞留，直到配置重新启用。
- 投递详情 DTO 已包含 `destination.enabled` 与 `route.enabled`
  （`packages/core/src/operations.ts:114-121`），但详情页没有展示；
  路由列表只显示路由自身状态，不提示所选目标中已有停用项。

## 用户故事

- 作为值班 SRE，我在排查一条长期 pending 的投递时，能立刻看出它是被停用的目标或路由挡住，
  并直接跳到对应配置页恢复。
- 作为值班 SRE，我在路由列表能看出哪些路由包含已停用的通知目标，避免误以为路由仍完整生效。

## 范围

- 投递详情：当投递为 `pending` 且目标或路由已停用时，展示警示条，说明滞留原因，
  并提供到「通知目标」/「路由规则」页面的链接。
- 路由列表：通知目标列在存在停用目标时显示「N 个目标已停用」徽标。
- 纯前端改动，复用现有 DTO 字段；中英文文案同步。

## 非目标

- 不改变入队或领取语义，不自动跳过、删除或补发滞留投递。
- 不新增数据库字段、迁移或服务端 DTO。
- 不做批量滞留诊断页，不改变已抑制、运行中、失败投递的现有展示。

## 验收标准

- `state=pending` 且 `destination.enabled=false`：显示目标停用警示与链接。
- `state=pending` 且 `route.enabled=false`：显示路由停用警示与链接。
- `state=pending` 且两者均停用：同时说明两者，并给出两个链接。
- 非 `pending`，或目标与路由均启用：不渲染警示。
- 路由列表通知目标列：至少一个目标停用时显示停用计数徽标，全部启用时不显示。
- 中英文 i18n key 对等；组件测试覆盖上述分支。

## 架构边界

- `apps/console/src/features/deliveries/ui`：新增滞留警示组件并接入投递详情视图。
- `apps/console/src/features/routes/ui`：在通知目标单元格展示停用计数。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/`、`infra/`、数据库或 oRPC 契约改动。
