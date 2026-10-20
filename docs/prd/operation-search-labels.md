# 运维搜索：覆盖事件标签与上游元数据

状态：已实现。

## 问题

Events/Deliveries 的搜索框只匹配标题、消息、指纹、ID、最近错误、目标名、路由名与外部
消息引用（`history.repository.ts:423-441,449-470`）。但值班排查时最常用的定位线索往往是
上游告警自带的标签（`service`、`env`、`instance`、`alertname`）或 provider 元数据
（如 Grafana 的 `receiver`、Alertmanager 的 `groupKey`）。这些字段已经落库
（`schema.ts:68,70`、`intake.repository.ts:50-52`），却没有进入搜索谓词，工程师只能先
按标题猜关键词，再逐条打开详情核对标签。

搜索框的占位文案也只承诺「标题、消息、指纹或 ID」
（`zh-Hans.json:703-704`），与运维实际可用的检索维度不一致。

## 用户故事

作为值班工程师，我在告警风暴中拿到一条上游通知（例如「checkout 服务在 prod 环境延迟」），
希望直接在 Events 或 Deliveries 搜索框输入 `checkout`、`prod` 或 `sre-oncall`，就能找到
带对应标签或上游元数据的事件及其投递，而不用逐条打开详情比对。

## 范围

- 事件搜索谓词新增 `events.labels_json` 与 `events.provider_metadata_json` 的字面子串匹配。
- 投递搜索谓词复用同一组事件字段，保证「事件能搜到，它的投递也能搜到」。
- 列表与 `total` 继续共用同一谓词（`eventSearchPredicate` / `deliverySearchPredicate`）。
- 沿用现有 `escapeLikeTerm`：`%`、`_`、`\` 仍按字面量处理。
- 中英文搜索占位文案补充「标签、上游元数据」。
- 新增仓储测试：标签值、标签键、上游元数据、事件与投递两侧，以及「原始载荷不可搜」的
  负向用例。

## 非目标

- 不实现 `key:value` 结构化查询语法、布尔组合或保存的搜索视图。
- 不搜索 `raw_payload_json` 与 `raw_headers_json`：它们是唯一按原样保存凭据的字段，
  匹配它们会让搜索变成探测 secret 的工具；读取投影仍按现有规则脱敏。
- 不新增索引、不新增迁移、不改变搜索的「字面子串」语义。
- 不改动 Events/Deliveries 的返回 DTO 或前端表格列。

## 验收标准

1. 事件标签值 `checkout` 能在 Events 列表搜到对应事件，`total` 与列表一致。
2. 同一条事件产生的投递能在 Deliveries 列表用同一关键词搜到。
3. 标签键（如 `env`）也能命中，便于「找出所有带该标签的事件」。
4. 上游元数据值（如 `sre-oncall`）在两侧都能命中。
5. `raw_payload_json` 中的凭据形态字符串**不**产生匹配。
6. `%`、`_` 仍按字面量处理，不被当作通配符。
7. `vp check` 0 errors，`vp run -r test` 全绿。

## 架构边界

- 仅修改 `infra/sqlite/repositories/history/history.repository.ts` 的两个私有谓词函数，
  不新增服务、oRPC 过程、contract 字段或迁移。
- 搜索仍是数据库侧的字面子串匹配，不解析 JSON、不执行用户提供的表达式。
- 标签与上游元数据在 DTO 投影时继续走既有脱敏（`redactEventRecord`）；本切片只扩大
  匹配范围，不改变任何返回字段的内容。
