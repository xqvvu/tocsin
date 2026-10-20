# 路由匹配证据本地化与完整展示

状态：已实现（第 40 轮 UI 评审，对应 backlog UI-17）

## 问题

事件详情的「路由匹配」表和投递详情的「路由命中依据」共用同一组证据徽标
（`apps/console/src/features/routes/ui/route-match-check-badges.tsx:13-31`），但中文界面里：

- 严重程度与状态的**实际值**仍显示英文枚举：`期望 严重，事件实际为 critical`、
  `期望 触发中，事件实际为 firing`（`route-match-check-badges.tsx:84-90` 直接把
  `check.actual` 插入文案，只有 `expected` 走了 `common.severity.*` /
  `common.alertStatus.*` 的本地化）。
- 标签证据重复渲染字段名：徽标先显示字段标签「标签」，文案又以「标签 {key}」开头，
  读起来是「标签 标签 component 期望 …」（`zh-Hans.json:726-727`）。
- 徽标基类固定 `h-5`、`whitespace-nowrap`、`overflow-hidden`
  （`apps/console/src/components/ui/badge.tsx:8`），证据 span 又加 `truncate`
  （`route-match-check-badges.tsx:26`），长 expected/actual 只剩省略号，完整信息只能靠
  原生 `title` hover 查看；触屏与读屏用户拿不到。

值班人员在判断「这条告警为什么没命中路由」时，最关键的就是实际值；英文枚举和截断会直接
拖慢排障。

## 用户故事

作为一名中文界面的值班 SRE，我希望路由匹配证据里的严重程度、状态与标签都以中文展示，
并且较长的期望值/实际值能换行完整显示，不需要把鼠标悬停在徽标上。

## 范围

- `RouteMatchCheckBadges`：
  - 严重程度、状态的实际值复用既有 `common.severity.*` / `common.alertStatus.*` 文案。
  - 已结构化的标签、标题、消息等条件保持原值，不做机器值翻译。
  - 徽标允许自然换行：高度自适应、取消 `truncate` 与强制单行，长证据完整可见。
- 中英文文案：去掉 `routeChecks.label` / `routeChecks.labelMissing` 中重复的
  「标签 / label」前缀，字段名只由徽标渲染一次。
- 新增组件测试覆盖：实际值本地化、标签只出现一次、未知字段仍回退原始 `detail`。

## 非目标

- 不改变 core 产出的 `RouteMatchCheck` 结构、匹配语义或快照格式。
- 不翻译指纹、标签值、标题、消息等用户数据。
- 不重做事件详情移动端布局（UI-18）、投递列可读性（UI-19）或投递健康徽标（本轮新发现）。
- 不新增依赖、oRPC 过程、DTO 字段或迁移。

## 验收标准

- 中文界面中严重程度/状态证据显示「严重 / 警告 / 触发中 / 已恢复」等中文，不再出现
  `critical` / `firing` / `warning`。
- 标签证据读作「标签 component 期望 api，事件实际为 web」，字段名只出现一次。
- 长证据在桌面与窄视口下可换行完整显示，不依赖 hover。
- 历史快照没有 `condition` 时仍原样渲染 `detail`，不因本次改动丢失证据。
- `vp check` 与 `vp run -r test` 通过。

## 架构边界

- 纯前端切片：`features/routes/ui/route-match-check-badges.tsx` 与两份 i18n 消息文件。
- 复用现有 `useTranslations()` 与 `common.severity.*` / `common.alertStatus.*` 键；
  不新增翻译命名空间。
- 组件继续由事件路由匹配表与投递路由证据面板共用，避免两处文案漂移。
- 无服务端、契约、持久化或依赖变化。
