# 运维列表空态与分页收敛（UI-2 / UI-7 / UI-10）

状态：已交付（第 28 轮）

## 问题

Events、Deliveries 等运维列表在「没有任何数据」和「筛选条件没有命中」时显示同一套空态文案，
值班人无法判断是上游真的安静，还是自己的筛选写错了。与此同时：

- 空表仍渲染分页条（「暂无事件 · 第 1/1 页 · 上一页 1 下一页」），在零数据时制造并不存在的翻页语义；
- 空态被居中放在最小宽 1280px 的表格单元格里，390px 移动端只会看到空白横向滚动区，
  真正的提示文字落在视口之外。

## 用户故事

- 作为值班工程师，我在事件流为空时希望看到「还没有事件」；在我筛选之后仍为空时，
  希望看到「没有匹配的事件」并能一键重置筛选，而不是怀疑 Webhook 失效。
- 作为在手机上查看告警的工程师，我希望空态文字直接出现在屏幕内，不需要横向拖动表格才能读到。
- 作为运维人员，列表为空时我不希望看到「第 1/1 页」这类无意义的分页控件。

## 范围

- `components/common/operations-table.tsx`：空表时把空态固定在视口宽度内，并保持表格最小宽度
  （表头仍可横向滚动）；`data.length === 0` 时不渲染内置分页条，移除随之失效的 `emptyRangeLabel` 入参。
- `features/events/ui/events-empty-state.tsx`、`features/deliveries/ui/deliveries-empty-state.tsx`：
  接收 `hasActiveFilters`，区分「还没有数据」与「筛选无匹配」，后者提供内联「重置筛选」按钮。
- `events-table.tsx`、`deliveries-table.tsx`、`suppression-hits-table.tsx`：`total === 0` 时隐藏服务端分页条。
- `features/operations/model/operation-search.ts`：新增 `hasOperationFilters(search)`，由页面统一计算筛选态。
- i18n：中英文各新增两条筛选空态文案。
- 顺带删除无任何 import 的 `operations-panel.tsx` / `detail-panel.tsx`（backlog FIX-5 的一半），
  否则它们会继续引用已变更的表格 props。

## 非目标

- 不改服务端查询、分页协议或 URL 参数语义。
- 不为配置列表（Sources/Destinations/Routes/Feishu 应用）增加筛选空态；它们目前只有空数据态。
- 不重做列表页视觉，不引入新的组件库或图标集。

## 验收标准

1. 事件流无数据：显示「还没有事件」，且不出现分页条。
2. 事件流带筛选无命中：显示「没有匹配的事件」与原因说明，点击空态内「重置筛选」后 URL 查询清空并回到空数据态。
3. 投递列表同样满足 1、2。
4. 390px 视口下，Events / Deliveries / 告警源空态文字完整落在视口内；表头仍可横向滚动。
5. 有数据时仍渲染分页条（范围文案 + 页码 + 上一页/下一页）。
6. `vp check`、`vp run -r test`、`vp run -r build` 全部通过。

## 架构边界

- 空态与分页属于 `components/common` 的通用表格能力，不引入业务规则；筛选态判断留在
  `features/operations/model` 与各 feature 页面，经由 props 传入。
- 不新增服务端接口、数据库字段或依赖；纯前端切片，可整体回滚。
- 验证记录：隔离实例 `localhost:6190` + 临时 SQLite，桌面 1440 与移动 390 实测，
  截图位于 `/tmp/tocsin-r28-*.png`（不提交二进制）。
