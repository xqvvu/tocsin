# 英文界面的列表计数使用正确的单复数

- 状态：已实现（第 121 轮）
- 来源：UI 评审发现 UI-72（第 119 轮浏览器实测，第 121 轮修复）
- 关联：`apps/console/src/i18n/messages/en-US.json`、
  `apps/console/src/i18n/messages.test.ts`

## 问题

英文界面列表页脚把计数与名词直接拼接，单行结果也显示复数：

- 告警源列表只有一条时显示 `1 sources`（截图 `/tmp/tocsin-ui-r119/12-sources-list.png`）；
- 同一套文案键被通知目标、路由、投递、事件、飞书应用、静默规则复用，都存在同类问题
  （`en-US.json:374,602,783,832,1031,1167,1319,1361`）；
- 既有组件测试甚至把错误文案锁成了期望值
  （`feishu-apps-page-unification.test.tsx:132-133` 断言 `1 Feishu apps` / `1 sources`），
  所以修复必须同步更正该断言。

中文文案不受影响（`共 N 个告警源`、`N 条投递` 没有复数变化）。

## 用户故事

作为使用英文界面的值班运维，我筛选后只剩一条告警源或一条投递时，希望页脚显示
`1 source` / `1 delivery`，而不是明显的语法错误，这样我在交接和截图取证时不需要再解释
界面的低级错误。

## 范围

- 把 8 个计数文案键改为 ICU 复数形式（`{total, plural, one {# …} other {# …}}`），
  由 `use-intl` 在运行时按 `total` 选择分支：
  - `sources.table.pagination.range`
  - `destinations.table.pagination.range`
  - `routing.table.pagination.range`
  - `deliveries.table.range`
  - `events.table.range`
  - `integrations.table.pagination.range`
  - `suppressions.table.pagination.range`
  - `suppressions.hits.pagination.range`
- 在 `messages.test.ts` 里用 `createTranslator` 覆盖 `total = 0 / 1 / 7` 三种取值，
  并断言中文文案不受影响。
- 更正 `feishu-apps-page-unification.test.tsx` 中锁定错误文案的断言。

## 非目标

- 不改中文文案，不改计数之外的任何界面文案。
- 不引入新的 i18n 库或复数规则基础设施（`use-intl` 已支持 ICU）。
- 不改列表分页、筛选、查询或服务端 DTO。

## 验收标准

1. 英文界面下列表页脚在 `total = 1` 时显示单数（`1 source`、`1 delivery`、`1 Feishu app` 等），
   `total = 0` 与 `total > 1` 显示复数。
2. 中文界面文案保持原样。
3. 新增/更新的单元测试覆盖上述行为；既有 i18n 一致性测试（键位对齐、扁平结构、无句号）保持通过。
4. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 改动只在 `apps/console/src/i18n` 的英文文案、对应测试与一处既有组件测试断言。
- 无迁移、无新依赖、无环境变量变化；回滚只需还原文案与测试文件。
