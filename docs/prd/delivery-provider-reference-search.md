# 投递搜索覆盖外部消息引用

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：backlog `REQ-66`；`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」。

## 一句话结论

Deliveries 列表的搜索框现在也能按**目标平台返回的外部消息引用**检索，值班工程师
拿到飞书消息 ID、Webhook 回执号等引用值后，可以直接粘进搜索框定位到那次投递，
而不必先翻到详情页再逐条比对。

## 1. 问题

投递详情页已经展示目标平台返回的引用值（`providerReference.value`，例如飞书
`om_...` 消息 ID、Generic Webhook 回执号），用于到目标平台核对消息
（`apps/console/src/features/deliveries/ui/delivery-summary-tab.tsx`、
`apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:50-58`）。
该值持久化在 `deliveries.provider_ref_value`
（`apps/console/src/infra/sqlite/migrate/schema.ts:126-127`）。

但 Deliveries 列表的搜索谓词只覆盖投递/事件 ID、事件标题、消息、指纹、最新错误、
目标名称与路由名称，没有 `provider_ref_value`
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:426-455`）。
结果是：上游平台或告警群里给出一个外部消息引用时，工程师只能逐页翻投递或先猜目标，
搜索框对其返回空结果，与详情页已经展示的字段不一致。

## 2. 用户故事

作为值班工程师，我在飞书群、工单或上游系统里拿到一条消息引用（如 `om_xxx`）后，
希望直接粘进 Deliveries 搜索框就能找到对应的投递及其事件，这样我能立刻回到当时的
告警和目标平台会话，而不必逐页翻找。

## 3. 范围

- `deliverySearchPredicate` 增加
  `deliveries.provider_ref_value LIKE <term> ESCAPE '\'` 分支。
- 列表查询与 `total` 计数继续共用同一谓词，计数查询不新增 join，避免重复计数。
- Deliveries 页搜索占位文案补充「外部消息引用」；Events 页文案与搜索范围不变。
- 仓储测试新增：按引用值命中唯一投递、`total` 与 `items` 一致；事件列表不因该引用命中。
- 组件测试同步更新 Deliveries 页占位文案断言。

## 4. 非目标

- 不搜索 `provider_ref_type`（机器类型名，运维通常拿到的是值）。
- 不让 Events 列表按投递外部引用搜索；事件搜索范围保持现状。
- 不做模糊匹配、分词或相关性排序；仍是字面量子串匹配，沿用 `%`、`_`、`\` 转义。
- 不新增 URL 参数、筛选控件、oRPC procedure、索引或迁移。
- 不改变投递、路由、抑制或鉴权语义。

## 5. 验收标准

1. `listDeliveries({ q: "<providerReference.value 片段>" })` 返回对应投递，
   `total` 与 `items` 长度一致。
2. `listEvents({ q: "<providerReference.value>" })` 不返回该事件（范围边界）。
3. `%`、`_` 仍按字面量处理，不被当作通配符。
4. 原有搜索测试（标题、消息、指纹、ID、错误、目标、路由）全部通过。
5. Deliveries 页占位文案承诺外部引用；Events 页文案不变。

## 6. 架构边界

- 只改
  `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`
  的 `deliverySearchPredicate` 与其注释，以及两份 i18n 文案和一个组件测试。
- 不触碰 schema、迁移、oRPC contract、service、路由/投递语义与 secret 处理；
  新增字段读取只发生在 SQL 谓词中，不进入任何 DTO。
