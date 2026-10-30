# 事件列表搜索覆盖投递失败原因

状态：**已实现（2026-10-30 第 181 轮）**
来源：requirements 车道（第 181 轮）；`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」。

## 问题

Events 页的搜索只把投递表当作「投递 ID 与外部消息引用」的来源：`eventTermPredicate` 的相关 `EXISTS` 只匹配 `searched_deliveries.id` 与 `provider_ref_value`（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:898-919`），而同一文件的投递搜索 `deliveryTermPredicate` 早已覆盖 `deliveries.last_error` 与任一次 `delivery_attempts.error`（`:944-962`）。

后果：值班在事件列表搜索 `401`、`channel_not_found`、`timeout` 这类失败文本时，只能碰运气命中事件自身字段；想从一条失败的投递通知回到受影响的那批告警，只能先进投递列表再逐条下钻。事件列表本来就有「投递结果」维度，搜索却与它不对齐。

## 用户故事

作为 on-call 工程师，我想在事件列表直接搜索投递错误文本，以便从失败原因出发找到受影响的告警，而不是逐个打开投递详情确认。

## 范围

- 事件词项谓词增加两个相关 `EXISTS`：`deliveries.last_error` 与 `delivery_attempts.error`，复用现有 `escapeLikeTerm` 与多词 AND 语义（`history.repository.ts` 的 `eventTermPredicate`）。
- 同步搜索占位文案（`apps/console/src/i18n/messages/zh-Hans.json`、`en-US.json` 的 `operations.filters.searchPlaceholder`）。
- 补两条仓储用例（`history/search.test.ts`）：只出现在 `last_error` 的文本、以及只留在历史尝试里的文本，都能命中父事件，且 `total` 与行数一致。

## 非目标

- 不搜索 `raw_payload_json` / `raw_headers_json`（保持既有「原始文档不可搜索」的边界）。
- 不修改投递列表的搜索谓词，不改 DTO、契约、URL 参数或投递语义。
- 不加索引、不做迁移、不做命中高亮。

## 验收标准

1. 只出现在 `deliveries.last_error` 的字符串在 `listEvents` 中返回其父事件，`total` 与返回行数一致。
2. 只出现在一次更早、后来被成功重试清空的 `delivery_attempts.error` 中的字符串，仍能命中该事件。
3. `%` / `_` / `\` 字面量与纯空白查询的行为与修改前一致；只出现在 raw payload 中的诱饵事件不返回。

## 架构边界

- 纯只读 SQL 谓词，位于 `infra/sqlite/repositories/history`，不触碰 schema、迁移、鉴权与投递写入路径。
- 计数查询与列表查询共用同一谓词，`EXISTS` 不引入 join 行膨胀，`total` 不会与分页结果不一致。
- 符合单进程、SQLite-first、自托管定位；无新依赖、无新服务。
