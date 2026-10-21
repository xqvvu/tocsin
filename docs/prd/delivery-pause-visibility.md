# 全局投递暂停的常驻可见性

- 状态：已实现（第 65 轮，NEW-AF）
- 相关代码：`apps/console/src/shell/dashboard-header.tsx`、
  `apps/console/src/features/configuration/ui/delivery-pause-indicator.tsx`、
  `apps/console/src/features/configuration/api/configuration.queries.ts`

## 问题

全局暂停是实例级急停：暂停期间 Worker 不回收、不领取任何投递
（`delivery-worker.service.ts:60-76`）。但暂停态只出现在两处——Settings 的「界面」页签
（`settings-delivery-pause-panel.tsx`）与 Deliveries 页横幅（`deliveries-paused-notice.tsx`）。
Dashboard 顶栏只挂静默指示器（`dashboard-header.tsx:30-31`），因此在 Events、Sources、
Routes、Suppressions 等页面，值班工程师看不到「出站投递已停」的任何信号：

- 上游安静与「全局暂停」在事件页看起来完全一样；
- 离开 Deliveries 页后，误留的暂停会静默中断全部投递，直到有人回到该页或 Settings；
- 暂停起始时间只在两处页面可见，排障时无法确认停了多久。

## 用户故事

作为值班 SRE，我在任意 dashboard 页面都能立刻看出出站投递被全局暂停，并能一键进入
Deliveries 的恢复入口，避免把暂停误判为上游安静、或忘记恢复。

## 范围

- Dashboard 顶栏新增暂停徽标，与现有静默指示器并列，读取
  `appSettingsQueryOptions()`（复用已有查询与缓存）。
- 暂停时渲染 destructive 徽标，链接 `/deliveries`（横幅内含暂停起始时间与恢复按钮）；
  tooltip 与无障碍名称复用 `deliveries.paused.title`。
- 加载中或查询失败时不渲染：瞬时请求失败不能伪装成暂停。
- 窄屏（< `sm`）只显示暂停图标，名称由 `aria-label` / `title` 提供，避免挤压标题区。
- 中英文案复用既有 `deliveries.paused.title`，不新增翻译键。

## 非目标

- 不改变暂停/Worker/加急的语义与 oRPC contract。
- 不做自动恢复、定时恢复或按目标/路由的细粒度暂停。
- 不与静默指示器合并、不显示队列积压统计。
- 不把设置读取放进路由 loader 或 SSR loader data。

## 验收标准

- 暂停时，任意 dashboard 页面顶栏出现「出站投递已暂停」徽标，链接到 `/deliveries`；
  恢复后下一次查询刷新即消失。
- 未暂停、查询加载中、查询失败三种状态下都不渲染徽标。
- 徽标可通过键盘聚焦，无障碍名称为暂停文案。
- 390px 宽度下只显示图标，顶栏标题不被截断。
- 组件测试覆盖暂停/未暂停/查询失败三种状态；`vp check`、`vp run -r test`、
  `vp run -r build` 通过。

## 架构边界

- 纯前端：`shell/dashboard-header.tsx` 组合 + `features/configuration/ui/` 组件；
  状态走 TanStack Query 的 `appSettingsQueryOptions`，不新增全局状态库。
- 无迁移、无 contract 变化、无服务端改动、无新依赖。
- 组件不读取路由参数，不写 URL 状态。
