# 停用配置前披露排队中的投递数

> 状态：已实现（2026-10-22 核实：`destination-edit-dialog.tsx` 已渲染排队投递数量提示）。
> 以下「问题」节为实现前的历史背景。

## 问题

- 告警源、路由、通知目标的停用确认框已经说明「已入队的投递仍会继续发送」
  或「已排队但尚未发送的投递会暂停」
  （`apps/console/src/i18n/messages/zh-Hans.json:917-918,754,287-288`），
  但没有给出数量。运维在停用前无法判断这次操作会影响多少条正在等待的投递。
- 三种配置的实际语义并不相同，且容易记反：
  - 停用告警源只拒绝新的 Webhook 接入，已入队投递继续照常发送；
  - 停用路由或通知目标会让已排队投递暂停，直到重新启用
    （`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:220-232`
    的 `claimNext` 只认领目标与路由都启用的 pending 投递）。
- 现有确认框只显示配置引用数（告警源显示已启用路由数、通知目标显示已启用路由数、
  路由显示关联目标数），
  `apps/console/src/features/sources/ui/source-actions.tsx:143-155`、
  `apps/console/src/features/destinations/ui/destination-actions.tsx:131-156`、
  `apps/console/src/features/routes/ui/routes-section.tsx:235-241`。
- 结果：值班 SRE 在停机维护或收敛告警时，只能先停用再回列表确认，或者凭经验猜测
  会不会让一批投递卡住。

## 用户故事

- 作为值班 SRE，在停用告警源前，我要看到当前有多少条投递仍在排队，并明确知道
  它们不会因为停用而中断。
- 作为值班 SRE，在停用路由或通知目标前，我要看到将有多少条排队投递被暂停，
  从而判断是现在停用还是等投递清空后再停用。
- 作为值班 SRE，当没有排队投递时，我要看到明确的「0 条」，而不是自行猜测。

## 范围

- 三个停用确认框在说明文案下增加一行计数：
  - 告警源按 `sourceId` 统计 `pending` 投递；
  - 路由按 `routeId` 统计 `pending` 投递；
  - 通知目标按 `destinationId` 统计 `pending` 投递。
- 复用现有 `operations.list`：`deliveryState=pending` 加对应维度筛选，读取
  `deliveries.total`（`packages/api/src/schemas/operations.ts:204-218`、
  `apps/console/src/infra/sqlite/repositories/history/history.repository.ts:358-408`）。
  请求 `limit: 1`，只取总数，不新增 oRPC procedure 或 DTO。
- 计数只在确认框打开时查询；关闭后组件卸载，配置列表不会为每行预取。
- 计数是辅助信息：加载中或查询失败时不渲染该行，停用操作照常可用。
- 计数缓存 15 秒，避免在相邻行之间反复打开时重复请求，同时仍能反映刚完成的投递。
- 新增 `operations.queuedDeliveries.count` 中英文文案；计数行带 `aria-live="polite"`，
  加载完成后读屏可感知。

## 非目标

- 不新增服务端 endpoint、DTO、数据库字段或迁移。
- 不改变停用/启用语义，不自动取消、暂停或重排任何投递。
- 不统计 `running`、`failed`、`succeeded` 或已抑制投递；本切片只回答「还有多少条
  在排队等待发送」。
- 不在列表页常驻显示排队数，也不做自动刷新（属于后续需求）。
- 不改动静默规则启停确认（UI-14）与删除级联披露（REQ-181）。

## 验收标准

- 停用告警源时，确认框显示「排队中的投递：N 条」，N 为该告警源下 `pending` 投递数；
  英文在 0/1/N 三种情况下分别显示 `No queued deliveries`、`1 queued delivery`、
  `N queued deliveries`。
- 停用路由/通知目标时，计数分别只统计该路由/该目标下的 `pending` 投递。
- 没有排队投递时显示 0（英文为 `No queued deliveries`），不隐藏该行。
- 查询失败或仍在加载时该行不渲染，确认按钮不受影响。
- 计数查询请求参数包含 `deliveryState=pending` 与对应 id，且只请求 1 行。
- 组件测试覆盖 0 / 1 / N / 失败四个分支；三个列表页的既有确认框测试继续通过。
- `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 查询工厂放在 `apps/console/src/features/operations/api/operations.queries.ts`，
  与其它运维查询共用 `operationsQueryKeys`，键包含全部影响结果的变量。
- 展示组件 `apps/console/src/features/operations/ui/queued-deliveries-notice.tsx`
  只读查询状态，不触碰业务规则；三个 feature 的 `ui/` 只负责传入作用域。
- 纯前端只读投影：不触碰 `server/`、`infra/`、oRPC 契约、auth 或投递语义。
- 无新依赖、无 schema 变更；回滚只需移除三处渲染与计数组件。
