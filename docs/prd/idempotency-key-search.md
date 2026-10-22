# 事件与投递搜索覆盖幂等键

- 状态：已实现（第 78 轮）
- 关联 backlog：NEW-BT

## 问题

事件详情页把 `idempotencyKey` 作为可复制标识展示，并提供「复制幂等键」动作
（`apps/console/src/features/events/ui/event-normalized-tab.tsx:51-57`），列值由接入时
的 provider 解析器写入（`apps/console/src/server/intake/intake.service.ts:112`、
`apps/console/src/infra/sqlite/migrate/schema.ts:68`）。但 Events 与 Deliveries 的搜索谓词
都没有包含该列（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:449-464,477-500`），
值班同学从上游系统或告警通知里拿到幂等键后粘贴到搜索框，会得到空结果，只能改用标题或
指纹二次猜测。搜索框占位文案也只承诺「ID」
（`apps/console/src/i18n/messages/zh-Hans.json:814-815`），没有说明幂等键是否可搜。

## 用户故事

作为值班 SRE，我在上游监控系统里看到一个幂等键，希望把它粘贴到 Tocsin 的事件或投递
搜索框，直接定位到对应事件及其投递，而不需要先猜标题、指纹或事件 ID。

## 范围

- 在 `eventSearchPredicate` 中增加 `events.idempotency_key LIKE ? ESCAPE '\'`。
- 在 `deliverySearchPredicate` 中同样增加事件幂等键条件，使投递列表也能从幂等键反查。
- 更新两个谓词的注释，把「identifiers」明确为事件 ID、投递 ID 与幂等键。
- 更新中英文搜索占位文案，加入「幂等键 / idempotency key」。
- 更新 `redactEventRecord` 中「幂等键不参与读取期匹配」的注释：投影仍然脱敏，但匹配
  按原始值进行，与 title/message/fingerprint/labels 的既有规则一致；命中只暴露「存在」。
- 补充搜索测试：事件列表、投递列表、`total` 一致、`%`/`_` 通配符转义、空/`null`
  幂等键不误命中、不搜索 raw payload 的既有边界保持不变。

## 非目标

- 不把 `idempotencyKey` 加入列表 DTO，也不改变事件详情投影的脱敏行为。
- 不改变幂等键的生成、去重语义或接入路径。
- 不新增索引或迁移：搜索是已有的 `LIKE` 扫描，本次只是多一列条件。
- 不搜索 raw payload、raw headers 或其他未投影字段。
- 不改变搜索框的匹配方式（仍为子串、大小写不敏感由 SQLite `LIKE` 决定）。

## 验收标准

1. `listEvents({ q: "<幂等键>" })` 返回对应事件，且 `total` 与列表条数一致。
2. `listDeliveries({ q: "<幂等键>" })` 返回该事件产生的投递，`total` 一致。
3. 幂等键中的 `%`、`_` 按字面量匹配，不被当作通配符。
4. `idempotency_key` 为 `NULL` 的事件不会因空查询或通配符查询被误命中。
5. 不含幂等键的既有搜索行为（标题、消息、指纹、标签、上游元数据、ID、错误、
   通知目标、路由、外部消息引用）全部保持通过。
6. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 改动只落在 SQLite 仓储的搜索谓词与测试，不触及 service、oRPC 契约、DTO、迁移或接入
  语义；列表与计数继续共用同一谓词，避免分页与 `total` 漂移。
- 匹配使用存储的原始值，输出仍经过既有脱敏投影（`redactEventRecord`），与
  title/message/fingerprint/labels 的边界一致：命中只说明存在一行，不把原始值回显到浏览器。
