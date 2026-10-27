# 静默规则列表：窄屏固定操作列

- 状态：**已实现**（第 146 轮，UI 评审切片）
- 关联：backlog `UI-85`；`docs/prd/suppression-list-filters.md`（同页筛选）

## 问题

`/suppressions` 表格沿用运维表格外壳的最小宽度（980px），而 390px 视口下可视区只有约
348px。横向滚动之前，操作员只能看到「规则名称 / 用途 / 适用条件」，**状态与操作
（编辑、启停、删除）整列在视口外**，且 macOS 默认不显示滚动条，没有可发现性提示
（浏览器实测截图 `/tmp/tocsin-r146/08-suppressions-mobile-390-true.png`）。

同页的筛选工具条本身在 390/1440 都正常；问题只在表格列布局
（`features/suppressions/ui/suppressions-section.tsx` 的 `suppressionsColumnClassName`）。

## 用户故事

作为值班 SRE，我在手机上打开静默规则列表时，希望能直接看到并操作每一条规则的
启停/编辑/删除，而不必先猜到这个表格可以横向滚动。

## 范围

- `actions` 列复用 `components/common/operations-table-layout.ts` 的
  `stickyActionsColumnClassName`，并补 `w-[12%] min-w-24`，与 Events / Deliveries
  表格一致。
- 布局回归测试：断言操作列表头与单元格带 `sticky right-0 min-w-24`。
- 浏览器实测：390×844 初始滚动位置操作按钮全部可见；1440×900 列宽与视觉不变。

## 非目标

- 不重设计表格，不改变列宽百分比。
- 不处理「状态」列在窄屏被滚出视口的问题（可作为后续 mobile 堆叠切片）。
- 不改 Routes 表格（其操作列固定属 backlog `UI-23`）。
- 不引入新组件库、图标或动画。

## 验收标准

1. 390×844、至少 2 条规则时，操作列表头与行操作常驻表格右缘，编辑/启停/删除无需横向滚动。
2. 横向滚动到最右时操作列位置不变，表头与行背景不透出底层内容。
3. 1440×900 下表宽、列宽与改动前一致。
4. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

纯前端布局改动，复用 `components/common` 已有 sticky 列约定；不改 oRPC 契约、服务、
仓储、SQLite 或投递/路由/鉴权语义。
