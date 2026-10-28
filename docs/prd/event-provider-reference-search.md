# 事件搜索覆盖外部消息引用

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：backlog `REQ-305`；`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」。

## 一句话结论

Events 列表的搜索框现在也能按**目标平台返回的外部消息引用**检索。值班工程师在群聊、
工单或上游系统里拿到一条飞书消息 ID 等引用后，直接粘进事件搜索框就能定位到产生该消息的
告警事件，不必先切到 Deliveries 列表再反查。

## 1. 问题

投递详情页与 Deliveries 列表已经展示并可搜索目标平台返回的引用值
（`providerReference.value`，例如飞书 `om_...` 消息 ID、Generic Webhook 回执号），
持久化在 `deliveries.provider_ref_value`。

但 Events 列表的搜索谓词只覆盖事件身份字段、事件 ID，以及关联投递的 **Delivery ID**
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:848-869`），
不覆盖 `provider_ref_value`。而 Deliveries 的谓词已经覆盖它
（同文件 `:894-923`）。两个列表对同一个运维事实的检索能力不一致：

- 拿到外部消息引用时，操作员的第一反应是从**告警事件**出发（「这是哪条告警发出去的？」）。
- 现有路径要求先切到 Deliveries、搜索、再点进事件详情，多一次页面跳转与心理模型切换。
- 单条事件可能产生多条投递，引用只挂在其中一条上；事件列表却完全无法体现这层关联。

## 2. 用户故事

作为值班工程师，同事在飞书群里贴出一条消息 ID 并问「这是哪条告警？」时，我希望把该引用
直接粘进 Events 搜索框就能找到对应事件，这样我能立刻看到告警内容、路由与全部投递结果，
而不必先在 Deliveries 里定位再跳转。

## 3. 范围

- `eventTermPredicate` 的关联投递 `EXISTS` 子查询内增加
  `searched_deliveries.provider_ref_value LIKE <term> ESCAPE '\'`，与既有 Delivery ID
  分支并列（`history.repository.ts:859-868`）。
- 列表查询与 `total` 计数继续共用同一谓词；`EXISTS` 形状不变，计数查询不新增 join，
  同一事件的多条投递也不会被重复计数。
- Events 页搜索占位文案补充「外部消息引用」（`en-US.json:967`、`zh-Hans.json:967`）。
- 仓储测试更新：引用值同时命中投递与事件；`provider_ref_type` 这类机器值不参与搜索。
- 文档站 `apps/docs/guide/events.md` 的搜索字段表与常用检索示例同步。

## 4. 非目标

- 不搜索 `provider_ref_type`（机器类型名），只搜索运维实际拿到的引用值。
- 本切片有意推翻 `docs/prd/delivery-provider-reference-search.md` 中「不让 Events 列表按
  投递外部引用搜索」的非目标：事件列表已经通过关联投递匹配 Delivery ID，外部引用是同一类
  「这条告警发出去了什么」的事实，缺少它会让两个列表的检索能力继续不一致。
- 不把投递的其他事实（最新错误、目标名称、路由名称）纳入事件搜索；事件搜索只增加
  与「这条告警发出去了哪条消息」直接相关的一项。
- 不改变 `%`、`_`、`\` 的字面量转义语义，不引入分词、模糊匹配或相关性排序。
- 不新增 URL 参数、筛选控件、oRPC procedure、索引或迁移。
- 不修改投递、路由、抑制或鉴权语义。

## 5. 验收标准

1. `listEvents({ q: "<providerReference.value 片段>" })` 返回产生该投递的事件，
   `total` 与 `items` 长度一致，且同一事件不会因多条匹配投递重复出现。
2. `listDeliveries({ q: "<providerReference.value>" })` 行为不变。
3. `listEvents({ q: "feishu_message_id" })` 仍返回空结果（类型值不参与搜索）。
4. `%`、`_` 与 `\` 在事件搜索中仍按字面量处理。
5. 既有搜索测试（标题、消息、指纹、ID、幂等键、标签、上游元数据、raw payload 排除）
   全部通过。
6. Events 页占位文案承诺外部引用；Deliveries 页文案不变。

## 6. 架构边界

- 仅修改 SQLite history 仓储的搜索谓词与展示文案，属于 repository + UI 文案层。
- 不改变表结构、迁移台账或索引；`provider_ref_value` 为既有列。
- 不跨包新增依赖，不改变 oRPC 契约形状（查询参数仍为既有 `q`）。
- 引用值命中只说明「存在这条记录」，不额外暴露投递详情；DTO 投影仍按原有脱敏规则处理。
