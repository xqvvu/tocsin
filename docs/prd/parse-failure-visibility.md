# 告警解析失败：列表标记与详情诊断

- 状态：已实现（第 127 轮）
- 来源：backlog REQ-32（第 5 轮登记；第 127 轮复核后修正证据与范围）
- 关联：`packages/core/src/event/parse-failure.ts`、`packages/core/src/operations.ts`、
  `packages/api/src/schemas/operations.ts`、
  `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`、
  `apps/console/src/features/events/ui/event-title-cell.tsx`、
  `apps/console/src/features/events/ui/event-parse-failure-notice.tsx`

## 问题

接入解析器拒绝 Webhook 载荷时，Tocsin 会写一条审计事件
（`apps/console/src/server/intake/intake.service.ts` 的 `recordParserFailureEvent`）：
标题固定为 `Provider parser rejected webhook payload`，严重程度为 `unknown`，
诊断信息写在 `providerMetadata` 的 `parseFailed` / `reason` / `errorName` /
`errorMessage` / `payloadHash` 中，原始载荷另行保留。

这条事件在事件列表里与普通告警长得不一样，却没有说明：`EventListItem` 只有
标题、严重程度、状态等字段（`packages/core/src/operations.ts:125-136`），列表查询
也没有投影解析失败标记（`history.repository.ts` 的 `listEvents` select）。值班运维
看到的是一条「严重程度 unknown、标题很奇怪」的事件，无法判断是上游发了脏数据，
还是 Tocsin 没接住一条真实告警。

详情页把 `providerMetadata` 的标量逐条渲染（`event-upstream-source.tsx`），但键名是
英文机器键（`parseFailed`、`errorName`、`errorMessage`），位置在「标准化字段」标签页
底部，容易被当成上游元数据而不是故障诊断。搜索已经覆盖 `provider_metadata_json`
与 `labels_json`（`history.repository.ts` 的 `eventTermPredicate`），
`q=parse_failed` 能找到全部同类事件，但没有任何入口提示这个搜索词。

## 用户故事

作为值班运维，当上游告警突然解析失败时，我希望在事件列表一眼看到「解析失败」标记，
并在详情页直接读到失败原因、错误类型与错误信息，从而判断是上游改了格式还是解析器/
告警源配置问题，并在修复后重新匹配事件。

## 范围

- `@tocsin/core` 新增 `ParseFailureMetadata` 与 `parseFailureMetadataFrom`：从任意 JSON
  中提取 `parseFailed: true` 的诊断字段；损坏的行返回 `null` 而不是抛错。
- `EventListItem`（core 接口 + `@tocsin/api` schema）增加 `parseFailed: boolean`。
- 事件列表查询在既有 select 中多取 `provider_metadata_json`，用上述提取器投影标记；
  不增加查询次数，不改变计数与筛选逻辑。
- 列表事件标题单元格在解析失败时显示「解析失败」徽标，并带说明性 `title`。
- 事件详情在摘要与标签页之间新增「告警解析失败」提示：本地化已知 `reason`
  （`invalid_payload` / `unsupported_payload` / `configuration_error` /
  `unknown_error`），未知值原样展示；列出错误类型、错误信息、载荷哈希；
  提供「查看同类解析失败」链接到 `/events?q=parse_failed`。
- 中英文案与回归测试：core 提取器、仓储投影（含损坏 JSON）、列表徽标、详情提示。

## 非目标

- 不新增独立的解析失败筛选维度或 URL 参数；复用已有的全文搜索。
- 不新增解析失败计数、趋势或告警规则。
- 不改 intake 的写入语义、不自动重试解析、不改变事件严重程度/状态。
- 不在详情页重构整个「上游告警」面板；现有元数据展示保持不变。

## 验收标准

1. 解析失败事件在事件列表显示「解析失败」徽标，普通事件不显示。
2. 事件详情在摘要下方显示「告警解析失败」，包含本地化的失败原因、错误类型、
   错误信息与载荷哈希；未知原因显示原始机器值。
3. 提示中的「查看同类解析失败」链接跳转到 `/events?q=parse_failed`。
4. `provider_metadata_json` 损坏时，列表仍能返回该行并投影 `parseFailed: false`，
   不抛错、不返回 500。
5. 新增测试覆盖 core 提取、仓储投影、列表徽标与详情提示。
6. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 无 schema、无迁移、无写路径变化：`parseFailed` 完全在读时派生。
- `@tocsin/core` 只新增环境中立的纯函数与类型，不引入 `node:*`、`#/infra` 或
  `#/server` 依赖。
- 仓储只多选一列，不做新查询；损坏 JSON 的容错留在仓储内，避免把异常带给整页。
- 展示层只消费列表 DTO 与已经脱敏的 `detail.event.providerMetadata`，不新增
  敏感数据出口。
- 回滚：还原上述文件即可；`parseFailed` 是纯展示字段，旧数据与旧前端都不受影响。
