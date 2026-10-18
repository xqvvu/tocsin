# PRD：Destination 用真实历史 Event 预览

- 状态：已实现（2026-10-18）
- 来源：`docs/prd/destination-template-engine.md` 用户故事 11；backlog `REQ-26`

## 问题

Destination 模板预览目前只能用内置样例 Event 渲染。内置样例的 normalized 字段和 payload
都是固定的通用值，无法反映真实上游系统（Grafana、SigNoz、Uptime Kuma、Alertmanager、
通用 Webhook）实际发送的字段形状。SRE 在配置 `json_payload`、`slack_blocks` 或带
`payload.<key>` 变量的模板时，看到的是「样例渲染成功」，但真实告警到达后仍可能因为
字段缺失、类型不同或标签命名不同而渲染出空值或错误内容。

服务端已经支持用历史 Event 作为预览样本：

- `packages/core/src/configuration/configuration-commands.ts` 的
  `PreviewDestinationCommandSchema`、`PreviewDestinationDraftCommandSchema`、
  `PreviewDestinationUpdateCommandSchema` 均接受 `sampleEventId`。
- `apps/console/src/server/destinations/destination.service.ts` 的
  `resolvePreviewSample` 会读取历史 Event、脱敏 raw payload 与 headers，并把
  `sample.kind` 标记为 `historical_event`。

在此前的实现里，控制台从未传过这个参数：`destinations-page.tsx` 的三个预览入口都只传
`sampleStatus`，预览对话框也不展示当前样例来源。本切片已补齐这条链路（见下文范围与
验收标准），用户故事 11 现已交付。

## 用户故事

作为 SRE，我想在预览 Destination 模板时选择一条最近的真实历史 Event，这样我可以在保存前
用真实上游字段验证模板渲染结果，而不是只依赖内置样例。

## 范围

- Destination 预览对话框新增「样例来源」选择器：内置样例 + 最近 20 条历史 Event。
- 选择历史 Event 后，用同一个 Destination（或同一份草稿配置）重新执行预览：
  - 列表页「预览」按钮 → `destinations.preview`
  - 新增表单「预览」→ `destinations.previewDraft`
  - 编辑表单「预览」→ `destinations.previewUpdate`
- 对话框展示当前样例来源：内置样例，或历史 Event 的告警源与接收时间。
- 历史 Event 列表按 `receivedAt` 倒序，来自现有 `operations.list` 投影；事件选择器只在
  预览对话框打开时加载。
- 事件列表加载失败时仍可使用内置样例，并给出可读提示；没有历史 Event 时给出空态提示。

## 非目标

- 不新增服务端 procedure、表或持久化字段；复用既有 `sampleEventId` 输入。
- 不做事件搜索、分页或按时间范围选择；本轮只取最近 20 条。
- 不改预览返回结构、脱敏边界或模板渲染语义。
- 不把 `sampleEventId` 持久化到 Destination 配置；每次预览重新选择。
- 不在预览对话框内跳转到 Event 详情（Event/Delivery 互链属 backlog `REQ-10`）。

## 验收标准

1. 三个预览入口首次打开时使用内置样例，与改动前行为一致。
2. 预览对话框可切换任意一条最近历史 Event；切换后载荷、规范字段、模板上下文与
   raw 参考标签页都反映该 Event。
3. 对话框明确显示当前样例来源（内置 / 历史事件 + 告警源 + 接收时间）。
4. 历史 Event 已被保留策略清理或删除时，预览请求返回 NOT_FOUND，页面通过既有错误提示
   告知操作者；对话框保留上一次成功结果。
5. 事件列表为空或加载失败时，内置样例预览仍然可用。
6. `vp check`、console 测试与构建通过。

## 架构边界

- 预览请求编排留在 `features/destinations/ui/destinations-page.tsx`：记录最近一次预览请求
  （已保存 Destination / 草稿 / 编辑草稿），供样例切换后重放。
- 样例选择器是展示组件，由 `DestinationPreviewDialog` 接收事件列表与回调；
  服务器状态通过 `features/operations/api/operations.queries.ts` 的
  `recentEventsQueryOptions` 获取，不直接调用 oRPC。
- 不触碰 `server/destinations/**`；`sampleEventId` 的服务端语义与脱敏已有测试覆盖
  （`configuration.integration.test.ts`）。
