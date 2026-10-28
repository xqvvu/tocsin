# 投递搜索覆盖每一次尝试的错误

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」；
backlog `REQ-303`；承接 `docs/prd/delivery-search-fields.md`。

## 一句话结论

Deliveries 列表的搜索框除了投递当前的 `last_error`，还能按**任意一次投递尝试
的错误**检索。投递重试成功时 `last_error` 会被清空，过去只有翻详情页才能看到
那次失败，现在直接用错误文本就能找回整批受影响的投递。

## 1. 问题

投递表格的「错误」列展示 `deliveries.last_error`，搜索也只匹配这一列
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts`，
`deliveryTermPredicate`）。但 `last_error` 是**当前**失败原因：一次投递在
第 1 次尝试失败、第 2 次成功后，`markDeliveryAttemptSucceeded` 会把
`last_error` 置空
（`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:415-420`）。

于是值班场景里最常见的证据反而搜不到：

- 告警群里贴出 `connection refused`，工程师想确认「还有哪些目标报过同样的错」，
  但这些投递后来重试成功了，搜索返回空；
- 交接班记录写「昨晚有一批 503，后来自己恢复了」，想按 `503`/错误片段定位，
  只能逐个打开投递详情看尝试记录
  （`apps/console/src/features/deliveries/ui/delivery-attempts-table.tsx:34-46`）。

尝试错误已完整落库（`delivery_attempts.error`，
`apps/console/src/infra/sqlite/migrate/schema.ts:140-162`），且详情页可见，
只是搜索谓词没有覆盖它。

## 2. 用户故事

作为值班工程师，我在告警群或交接记录里拿到一段**曾经出现过**的投递错误文本后，
希望直接粘进 Deliveries 搜索框就能找到所有经历过该错误的投递（包括后来重试
成功的），这样我能一次判断影响面，而不必逐个打开详情页翻尝试记录。

## 3. 范围

- `deliveryTermPredicate` 增加一个相关 `EXISTS` 子查询：

  ```sql
  EXISTS (
    SELECT 1 FROM delivery_attempts AS searched_attempts
    WHERE searched_attempts.delivery_id = deliveries.id
      AND searched_attempts.error LIKE <pattern> ESCAPE '\'
  )
  ```

- 列表与 `total` 继续共用同一谓词；计数查询不新增 join，不会重复计数。
- Deliveries 搜索框占位文案从「错误」改为「任一次尝试的错误」（中英同步）。
- 仓储测试覆盖：最终成功的投递仍能按早期尝试的错误命中，且 `lastError`
  为空、`total` 与 `items` 一致。
- 更新 `deliverySearchPredicate` 的注释与 `docs/prd/delivery-search-fields.md`
  的非目标说明。

## 4. 非目标

- 不搜索 `delivery_attempts.response_body`（原始上游响应体，只在详情页以脱敏
  投影展示）。
- 不做 attempt 级筛选器、不做「第几次尝试」参数、不改 URL 参数形状。
- 不改 Events 列表的搜索范围。
- 不加索引、不引入 FTS 或外部搜索服务；`delivery_attempts` 上已有
  `(delivery_id, attempt_number)` 唯一约束，前缀足以支撑该 `EXISTS`。
- 无 schema 变更、无迁移。

## 5. 验收标准

1. `listDeliveries({ q: "<仅存在于尝试记录的错误片段>" })` 返回该投递，
   `total` 与 `items` 长度一致。
2. 命中行的 `lastError` 仍为 `null`，证明命中来自尝试记录而非当前错误列。
3. 已有的 `last_error` 搜索、目标/路由名称搜索、外部消息引用搜索行为不变，
   既有搜索测试全部通过。
4. `%`、`_`、`\` 仍按字面量处理。
5. Deliveries 页占位文案承诺「任一次尝试的错误」，Events 页文案不变。

## 6. 架构边界

- 只改 `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`
  的 `deliveryTermPredicate` 与注释、两个 locale 的占位文案、仓储测试与本 PRD。
- 不触碰 schema、迁移、oRPC contract、service 与投递/路由语义；无 secret
  暴露变化——`delivery_attempts.error` 本来就在详情页 DTO 中脱敏展示，
  搜索只产生「是否存在」的命中，不返回原始内容。
- 搜索仍在仓储层用 SQLite `LIKE` 完成，不引入新依赖。
