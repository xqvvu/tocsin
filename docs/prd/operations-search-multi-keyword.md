# 运维搜索支持空格分隔的多关键词 AND（REQ-239）

## 问题

Events 与 Deliveries 共用一个搜索框，`q` 被整体包成单个 `%term%`
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts` 的
`escapeLikeTerm`）。值班时手里往往同时有两条线索：告警标题里的一个词，和标签、错误或
通知目标里的另一个词。整串匹配要求两个词在**同一个字段里连续出现**，因此
「`disk`（标题）+ `prod`（标签）」这类跨字段组合查不到任何结果，操作员只能先搜一个词，
再在结果里用肉眼过滤。

## 用户故事

作为值班 SRE，我在搜索框里用空格分隔多个关键词，希望每个词都必须在**同一行的任意
可搜索字段**里命中，这样我能用「标题词 + 标签词」「错误词 + 通知目标名」快速缩小范围，
而不必知道每个词存在哪一列。

## 范围

- `q` 在仓储层按空白拆分为最多 8 个词；每个词的匹配列与现有单关键词完全一致
  （Events：标题、消息、指纹、幂等键、标签、上游元数据、事件/投递 id；Deliveries 另加
  错误、通知目标名、路由名、外部消息引用）。
- 词与词之间为 AND：每个词都必须在该行命中；词序不影响结果。
- 每个词独立转义 `%`、`_`、`\`，`100%` 仍按字面匹配。
- 列表查询与 `total` 计数共用同一组谓词，翻页与计数不漂移。
- 两个搜索框的 placeholder 补充「空格分隔多词需全部命中」提示。

## 非目标

- 不引入 OR、引号短语、字段前缀（如 `title:`）或布尔语法。
- 不改变 URL 契约（`q` 仍是单个字符串）、不新增筛选参数。
- 不改变可搜索字段集合，不把原始 payload / headers 纳入搜索。
- 不引入 FTS 表、不新增索引或迁移；超过 8 个词时忽略其余词，而不是报错。

## 验收标准

1. `q="disk root"` 命中标题含 `disk`、消息含 `root` 的事件；`q="disk oom"` 在两者分属
   不同事件时返回 0。
2. 词序无关：`q="latency prod"` 与 `q="prod latency"` 返回同一行（标题 + 标签跨字段）。
3. 通配符按词转义：`q="100% loss"` 命中 `100% packet loss`，`q="100% oom"` 返回 0。
4. Deliveries 列表同样 AND：`q="signature feishu"` 用 `last_error` + 通知目标名命中。
5. 超过 8 个词时只使用前 8 个；空白串等同无筛选。
6. 单关键词查询的结果与改造前一致；`page.total` 与列表同源。
7. 回归测试：`search.test.ts` 覆盖以上分支。

## 架构边界

- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：
  拆分词、逐词谓词、词间 AND；列表与计数继续复用同一函数。
- `apps/console/src/infra/sqlite/repositories/history/history.interface.ts`：更新 `q`
  的契约注释。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`：搜索框提示文案。
- 无 oRPC 契约变更、无迁移、无新依赖；回滚只需恢复整串匹配，不影响已存数据。
