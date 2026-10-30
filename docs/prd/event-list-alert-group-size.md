# 事件列表显示上游告警组规模

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` 的 `REQ-371`（requirements 车道第 190 轮）；
上游边界与模板侧用法见 `docs/prd/template-alert-count.md`。

## 1. 问题

Alertmanager 兼容上游（Alertmanager、Grafana、SigNoz）按通知组发送：一个组里可能有
20 条 alert，但 Tocsin 的解析器只把首条 alert 规范化成 Event，其余仅记录数量
（`packages/providers/src/shared/alertmanager-compatible.ts:63`、
`packages/providers/src/grafana/parse.ts:63`）。这个数量写在
`providerMetadata.alertCount`，事件详情页也已展示为「告警条数」
（`apps/console/src/features/events/model/event-upstream-source.ts:19`）。

但**事件流列表看不到它**：`EventListItem` 只投影了 `parseFailed`
（`packages/core/src/operations.ts:221-239`、`packages/api/src/schemas/operations.ts:48-63`），
仓储虽然选了 `provider_metadata_json` 却只用于解析失败判断
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:100-101,199`）。
结果是一次影响 20 条告警的大面积故障，在列表里和一条普通单点告警长得一模一样；
值班 SRE 必须逐条打开详情才能判断规模。

上一轮已把同一个数字暴露给通知模板（`{{tocsin.alertCount}}`），列表侧是它的自然补齐。

## 2. 用户故事

作为值班 SRE，我希望事件流列表直接标出「这一条事件聚合了多少条上游告警」，
这样扫一眼列表就能区分单点抖动和大面积故障，并决定先处理哪一条。

## 3. 范围

- `EventListItem` 新增 `alertCount: number | null`
  （`packages/core/src/operations.ts`），`EventListItemSchema` 同步
  （`packages/api/src/schemas/operations.ts`）：正整数或 `null`。
- 历史仓储新增 `alertCountFrom(providerMetadataJson)` 投影
  （`apps/console/src/infra/sqlite/repositories/history/history.helpers.ts`）：
  - 复用 `@tocsin/core` 的 `readProviderAlertCount`，只接受正的安全整数；
  - 元数据损坏、非对象、字段缺失或类型不对时投影为 `null`，与
    `isParseFailureRow` 一样容忍单行损坏，不让整个列表失败。
- 事件列表标题单元格在组规模**大于 1** 时显示 `N 条告警` 徽标
  （`apps/console/src/features/events/ui/event-title-cell.tsx`）：
  - 组规模为 1 或 `null` 时不显示：单条告警与普通事件不可区分，逐行加徽标只会增加密度噪音；
  - 徽标 `title` 说明这是上游聚合的告警组，并提示详情页可查看完整载荷。
- 中英文案（`apps/console/src/i18n/messages/{zh-Hans,en-US}.json`）。

## 4. 非目标

- 不拆分通知组：一个组仍然只产生一个 Event / 一条 Delivery，匹配、去重、抑制语义不变。
- 不新增表格列、不改列宽与 sticky 列：沿用标题单元格内的徽标，避免挤压 1280px 布局。
- 不改事件详情页、不改模板变量、不改过滤器（`alertCount` 不是筛选维度）。
- 无 schema 变更、无迁移、无新依赖、无环境变量。

## 5. 验收标准

1. `alertCount: 20` 的事件在列表标题行显示 `20 条告警`，悬停说明为上游聚合组。
2. `alertCount: 1` 与 `alertCount: null` 的事件不显示徽标。
3. 仓储投影：`20 → 20`、`1 → 1`、缺失 → `null`、损坏 JSON → `null`、
   字符串 `"20"` → `null`（`event-list-alert-count.test.ts`）。
4. 列表接口的 DTO 含 `alertCount`，且 `EventListItemSchema` 能解析该字段。
5. 组件测试覆盖显示/隐藏两种分支（`event-title-cell.test.tsx`）。
6. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 6. 架构边界

- 纯加法：新增只读 DTO 字段与一个仓储投影 helper；不改持久化、不改 oRPC procedure 形状。
- 计数来自已存的 `providerMetadata`，不是新采集的数据，也不需要回填。
- 可逆：回滚提交即可；旧构建读到多余字段会被忽略，无数据副作用。
