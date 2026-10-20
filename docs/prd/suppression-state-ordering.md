# 静默列表按生效状态置顶

状态：已实现。

## 问题

静默规则列表固定按 `created_at desc` 排序（`apps/console/src/infra/sqlite/repositories/suppression/suppression.repository.ts:19-25`）。
一旦规则数量超过一屏，新建的 `expired` 或 `disabled` 规则会压在正在生效的 `active`
规则上面：值班工程师打开页面先看到一排已经失效的规则，必须逐行看状态徽章才能找到
「现在到底静默了什么」。

这不是纯粹的排序偏好。抑制功能的决策记录明确把「别忘了它」的保障寄托在
**UI 列表置顶 + 状态徽章** 上（`docs/prd/alert-suppression-decisions.md:74`），
因为 v1 没有提醒通道，且 `endsAt` 强制有期限，规则会**静默地结束**。如果生效中的
规则不置顶、且到期时间不靠前，运维就会在「以为还静默着」和「其实告警已经在发」
之间反复误判。

## 用户故事

作为值班 SRE，我打开静默页面时，希望正在生效的规则永远排在最前面、最快到期的排在最前，
这样我能在第一屏确认「现在静默了什么、什么时候结束」；已停用和已过期的规则留在后面
备查，而不是挤占视线。

## 范围

- 在 `features/suppressions` 增加一个纯函数排序器，按 `suppressionStateAt` 的投影状态
  分档，仅用于静默列表页渲染：
  1. `active`：正在静默，按 `endsAt` 升序（最快到期的最前）；
  2. `scheduled`：即将生效，按 `startsAt` 升序；
  3. `disabled`：被显式停用，按 `updatedAt` 降序（最近操作的最前）；
  4. `expired`：已自动过期，按 `endsAt` 降序（最近结束的最前）。
- 同档内以 `createdAt` 降序、`id` 降序兜底，保证排序稳定、可复现。
- `SuppressionsSection` 用该排序器生成表格数据，`OperationsTable` 的分页与行 id 不变。
- 新增单元测试覆盖四个状态档位、档内方向、输入不被修改、兜底顺序。

## 非目标

- 不新增列头点击排序、排序下拉或用户可配置排序。
- 不修改仓储 `list()` 的 SQL 排序：其他调用方（如仪表盘生效指示器）继续使用仓储顺序；
  本切片只影响静默列表页。
- 不新增服务、oRPC 过程、DTO 字段或迁移。
- 不改变状态判定语义：`active/scheduled/expired/disabled` 仍由
  `suppressionStateAt` 按真实瞬时推导。

## 验收标准

1. 一条 `active` 规则即使 `createdAt` 更早，也排在所有 `scheduled`、`disabled`、
   `expired` 规则之前。
2. 多条 `active` 规则按 `endsAt` 升序排列，最快到期的在第一行。
3. 多条 `scheduled` 规则按 `startsAt` 升序排列。
4. 多条 `disabled` 规则按 `updatedAt` 降序排列；多条 `expired` 规则按 `endsAt` 降序排列。
5. 状态与档内时间都相同时，按 `createdAt` 降序、再按 `id` 降序，顺序稳定。
6. 排序不修改传入数组。
7. 列表页渲染顺序与排序器一致（jsdom 用例固定系统时间）。
8. `vp check` 0 errors，`vp run -r test` 全绿。

## 架构边界

- 仅新增 `features/suppressions/model/suppression-order.ts` 及其测试，并修改
  `features/suppressions/ui/suppressions-section.tsx` 的 `data` 派生。
- 复用 `@tocsin/core` 的 `suppressionStateAt`，不复制状态判定逻辑，不读取存储的状态列
  （不存在该列）。
- 纯客户端派生，无网络、无持久化、无 schema/迁移变化；回滚只需还原排序器调用。
