# 事件详情：窄视口布局

状态：已实现（第 94 轮）
编号：UI-42（承接 UI-18）
关联：UI-8、UI-21、UI-23

## 问题

事件详情是值班排障的主入口，但在 390×844 的手机视口下基本不可用：

- 摘要卡是 `shrink-0`（`apps/console/src/features/events/ui/event-detail-summary.tsx:45`），
  在 390 下高约 680px；内容区仍是 `min-h-0 flex-1 overflow-hidden`
  （`event-detail-page.tsx:26`），详情视图再叠加 `h-full`（`event-detail-view.tsx:19`），
  剩余高度不足时 Tabs 被压到最小。第 94 轮实测：`[role=tabpanel]` 的 `clientHeight`
  只有 40px，内部滚动容器 `clientHeight=16 / scrollHeight=263`，五个标签页都只露出一条内容，
  且页面没有纵向滚动。
- 默认 `en-US` 下五个标签在 390px 需要约 440px，而 TabList 只有 322px；
  `Fingerprint`、`Raw debug` 完全在可视区外，横向滚动又没有可见提示
  （`event-detail-view.tsx:37-39`）。
- `zh-Hans` 的 `events.detail.tabs.raw` 仍是英文 `Raw debug`
  （`apps/console/src/i18n/messages/zh-Hans.json:694`），中文界面残留英文。

## 用户故事

作为值班 SRE，我在手机上打开事件详情时，能读到当前标签页的完整内容，并看到全部五个标签，
而不是只看到一条几十像素高的缝隙、或需要盲猜右侧还有被裁掉的标签。

## 范围

- `event-detail-page.tsx`：内容区在 `<lg` 允许纵向滚动（`overflow-y-auto lg:overflow-hidden`），
  桌面继续使用满高内滚。
- `event-detail-view.tsx`：`<lg` 使用自然高度（`min-h-0 lg:h-full`）；TabList 在 `<lg`
  允许换行（`max-lg:flex-wrap max-lg:overflow-visible`）。
- `components/ui/tabs.tsx`：TabList 高度从固定 `h-8` 改为 `min-h-8`，TabTrigger 增加
  `min-h-7`。这样换行后的列表会随两行撑高，单行时高度与点击区域保持不变。
- `zh-Hans.json`：`events.detail.tabs.raw` 改为「原始调试」。
- 新增 `event-detail-view.test.tsx`，守卫五个标签、中文文案与窄屏布局类。

## 非目标

- 不修改任何 DTO、oRPC、service、repository 或迁移。
- 不重排摘要卡的信息层级，不改变桌面布局与表格列宽。
- 不为投递详情页做同样的窄屏适配；该页复用相同模式，另立 UI-46 候选。
- 不做移动端导航或整体视觉重设计。

## 验收标准

1. 390×844、`zh-Hans` 与 `en-US` 下，任一 Tab 面板 `clientHeight ≥ 280px`；
   同指纹页能看到「此前已出现 N 次」、变更列表与最近出现记录。
2. 390 下 `document.body.scrollWidth == window.innerWidth`；内容区可纵向滚动到底部，
   投递表完整可见。
3. `en-US` 390 下 TabList 换行为两行，`scrollWidth == clientWidth`，五个标签全部可见；
   `zh-Hans` 保持单行。
4. 1280×800 下 Tab 面板仍为 378px、无页面级滚动，与修复前一致。
5. `vp check` 0 error；`vp run -r test` 全绿；`vp run -r build` 通过。

## 架构边界

纯前端布局与文案改动：`features/events/ui` 与 shadcn `components/ui/tabs.tsx`。
无服务端、持久化、投递/路由/auth 语义变化；整体可回滚。
