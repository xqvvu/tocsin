# 运维筛选浮层在窄屏可用（UI-48 / UI-49 / UI-50）

状态：**已实现（UI-48 / UI-49 / UI-50，PR #428）**

## 问题

投递页的筛选面板放在共享 `Popover` 里。浮层只限制宽度、没有限制高度，也不会内部滚动
（`apps/console/src/components/ui/popover.tsx:36-41`）。在 390×844 的手机上实测，筛选面板
高约 783px，而锚点下方的可用空间只有约 269px，浮层底部落到 1075px，`overflow-y: visible`
（第 100 轮浏览器实测，截图见本轮评审记录）。结果是「时间口径」「时间范围」「尝试次数」
「投递状态」等控件都在首屏之外，页面滚动时浮层跟着锚点漂移，正好让上一轮新增的
「时间口径」在手机上不可达。

同一次评审还发现两处一致性问题：

- 筛选 chip 的可访问名称由可见文本拼成（`operation-filters.tsx:171-185`），读屏只会念
  「时间口径 更新时间」，听不出点击是在清除该筛选。
- 手改 URL `timeField=created` 会被当成活跃筛选（`operation-search.ts:153-169`），
  空结果显示「没有匹配」并多出一个 chip，而 `created` 本来就是默认口径。

## 用户故事

作为值班 SRE，我在手机上打开投递页排障时，希望能直接在筛选浮层里滚动到「时间口径」并
切换它，而不是先滚动整个页面、再追着浮层跑；使用读屏时，我也希望每个 chip 明确告诉我
点击会清除哪一项筛选。

## 范围

- 共享 `Popover` 的弹层默认限制在锚点可用高度内（`max-h-(--available-height)`），
  超出部分在浮层内部纵向滚动，并阻止滚动继续传递给页面（`overscroll-contain`）。
  这与 `Select`、`DropdownMenu`、`Combobox` 的既有做法一致
  （`components/ui/select.tsx:83`、`dropdown-menu.tsx:41`、`combobox.tsx:106`）。
- 筛选 chip 增加 `aria-label`，复用现有 `operations.filters.clearChip` 文案
  （`i18n/messages/zh-Hans.json:830`），保留 `title` 作为鼠标提示。
- `hasOperationFilters` 只把 `timeField === "updated"` 视为活跃筛选；`pruneSearch`
  把手改的 `timeField=created` 归一化为默认值，不再写回 URL 或渲染 chip。

## 非目标

- 不把筛选面板改成移动端 Sheet（更大改动，留待 UI-30 一类窄屏专项）。
- 不调整投递表的操作列宽度或列可见性（UI-30，独立切片）。
- 不改变筛选语义、服务端谓词、URL 键名或任何 DTO。
- 不新增依赖，不修改 shadcn 之外的自定义样式系统。

## 验收标准

1. 打开任意 `Popover` 时，弹层高度不超过锚点可用高度；内容更高时浮层内部可滚动，
   不再超出视口。
2. 390×844 下能从筛选浮层滚动到「时间口径」并完成切换。
3. 每个筛选 chip 的可访问名称包含「清除 + 筛选名」，读屏可判断点击动作。
4. 手改 `timeField=created` 时：不出现「时间口径」chip、`hasOperationFilters` 为 false、
   下一次筛选变更后该参数从 URL 消失。
5. `timeField=updated` 的 chip、清除与分页重置行为不变。
6. 回归测试覆盖：Popover 弹层的高度/滚动类、chip 可访问名称、默认口径不计为筛选。

## 架构边界

- `apps/console/src/components/ui/popover.tsx`：共享原语的高度与滚动约束。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：chip 条件与 `aria-label`。
- `apps/console/src/features/operations/model/operation-search.ts`：活跃筛选判定与 URL 归一化。
- 纯前端；无迁移、无新端点、无契约变化；回滚只需还原上述文件。
