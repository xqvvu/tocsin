# 删除告警源或通知目标前的路由级联影响

## 问题

- 删除确认框只说会「清理路由引用」：
  `apps/console/src/i18n/messages/zh-Hans.json` 的 `sources.delete.confirmDescription` 与
  `destinations.delete.confirmDescription`。
- 实际删除语义更重：仓储在移除引用时，如果某条路由因此不再有告警源或不再有通知目标，
  会直接删除整条路由（`apps/console/src/infra/sqlite/repositories/route/route.repository.ts:111-164`），
  该路由下的投递记录随之级联删除。
- 也就是说，删除一个告警源/通知目标可能悄悄带走多条路由与历史投递，而操作员在确认时
  无法从文案中看出影响面。这是配置删除流程里最危险的一半。

## 用户故事

- 作为值班 SRE，我在删除告警源或通知目标时，能在确认框里看到「将连带删除 N 条路由」
  与「将收窄 M 条路由」，从而在不可撤销操作前评估影响。
- 作为值班 SRE，我能区分「路由会消失」与「路由只是少一个引用、仍继续投递」这两种后果，
  避免误删仍被其他告警源/目标共用的路由。

## 范围

- 删除告警源确认框：按当前已加载的路由列表，计算该告警源被移除后：
  - 只匹配该告警源的路由（`rule.sourceIds` 仅剩它）→ 将随删除一起移除；
  - 仍匹配其他告警源的路由（`rule.sourceIds` 还有别的）→ 仅收窄引用，继续投递；
  - 通配路由（`rule.sourceIds` 为空）与未引用该告警源的路由不计入。
- 删除通知目标确认框：同口径，按 `destinationIds` 计算「将删除」与「将收窄」。
- 纯前端计算，复用两页已加载的路由数据；中英文文案同步。
- 新增共享纯函数与单元测试，并在两个列表页组件测试中覆盖删除确认框的展示分支。

## 非目标

- 不改变删除语义、级联规则或数据库结构。
- 不新增服务端 DTO、oRPC procedure 或迁移。
- 不在确认框中列出全部路由名，也不做「删除前撤销/回收站」。
- 不覆盖路由页面自身的删除确认（该操作不涉及引用收窄）。

## 验收标准

- 删除告警源时，若存在 `rule.sourceIds` 仅含该源的路由，确认框显示
  「将连带删除 N 条路由」，N 与实际会被删除的路由数一致。
- 若存在仍含其他告警源的路由，显示「将收窄 M 条路由」；两类可同时出现。
- 没有受影响路由时，不渲染任何影响提示，保留原确认文案。
- 通知目标按 `destinationIds` 同口径展示；通配或无引用路由不计入。
- 中英文 i18n key 对等；纯函数单元测试覆盖删除、收窄、无影响三种情况；
  组件测试覆盖两类提示与确认回调。
- 计算逻辑与仓储 `removeSourceReference` / `removeDestinationReference` 的删除判定一致
  （引用数组长度为 1 时删除）。

## 架构边界

- `apps/console/src/features/routes/model/route-reference-impact.ts`：纯函数与类型，
  不依赖 React 或服务端模块。
- `apps/console/src/features/sources/ui/source-actions.tsx` 与
  `apps/console/src/features/destinations/ui/destination-actions.tsx`：接收影响计数并渲染
  `Alert`；对应 section 负责用已加载路由计算。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/`、`infra/`、oRPC 契约或数据库改动；不新增依赖。
