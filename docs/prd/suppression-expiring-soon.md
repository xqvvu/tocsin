# 静默即将到期提示

## 问题

控制台顶栏的静默指示器只回答「现在有没有静默生效」，不回答「还能静默多久」。

- `summarizeActiveSuppressions` 只产出 `activeCount` / `catchAllCount` / `names`
  （`apps/console/src/features/suppressions/model/suppression-summary.ts:60-80`）。
- 指示器只渲染生效数量（`apps/console/src/features/suppressions/ui/active-suppression-indicator.tsx:37-52`）。

运维后果：维护窗口到期时告警会立即恢复推送，但值班同学看到的仍是一枚没有时间信息的
「生效中的静默：N 条」。窗口只剩十几分钟时，往往已经来不及决定「延长维护」还是
「接受告警恢复」。在告警风暴期间，这会变成一次没有预告的惊醒。

## 用户故事

作为值班工程师，当一条静默规则将在 30 分钟内结束时，我希望顶栏指示器明确告诉我
「其中 N 条 30 分钟内到期」，这样我能在告警恢复前决定是否延长维护窗口。

## 范围

- `summarizeActiveSuppressions` 增加 `expiringSoonCount`：只统计**当前生效**且
  `endsAt - now <= 30 分钟` 的规则。阈值以导出常量 `SUPPRESSION_EXPIRING_SOON_MS` 表达。
- 顶栏指示器在 `expiringSoonCount > 0` 时在既有标签后追加
  「其中 N 条 30 分钟内到期」（英文 `N expiring within 30 min`）。
  全量静默（catch-all）标签同样追加后缀。
- 中文与英文各新增一条 i18n 文案；不改动既有键。
- 单元测试覆盖：边界 30 分钟计入、31 分钟不计入；已停用/待开始/已结束/时间戳不可解析
  的规则不计入；组件测试覆盖普通标签与 catch-all 标签两种追加形态。

## 非目标

- 不做一键续期、不做在指示器里展开规则列表（由 REQ-39 单独评估）。
- 不改静默规则的判定语义、入队或认领逻辑。
- 不新增接口、不改 DTO、不改数据库。
- 不引入可配置阈值；30 分钟是固定产品口径。

## 验收标准

1. 存在一条 20 分钟后到期的生效静默时，顶栏显示
   「生效中的静默：1 条 · 1 条 30 分钟内到期」，点击仍跳转 `/suppressions`。
2. 只有 45 分钟后到期的静默时，不出现到期后缀。
3. 到期提示每 30 秒随控制台操作时钟刷新（沿用 `OPERATIONAL_CLOCK_REFRESH_MS`）。
4. 时间戳不可解析时不误报「即将到期」（保持静默，不新增噪声）。
5. `vp check` 与 `vp run -r test` 通过。

## 架构边界

- 计算留在 `features/suppressions/model/` 的纯函数里，不进入 oRPC、service 或仓储；
  数据源仍是既有的 `suppressionsQueryOptions()`。
- 组件只做文案与呈现，不重新计算时间语义。
- 不新增依赖，不触碰 `packages/core` 的静默状态机。
