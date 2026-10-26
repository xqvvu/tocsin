# 投递详情标注「目标当前配置」并在投递后变更时提示

- 状态：已实现（第 108 轮）
- 来源：requirements lane 发现 REQ-265（`docs/planning/iteration-backlog.md`）
- 关联：`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts`、
  `apps/console/src/features/deliveries/ui/delivery-detail-view.tsx`

## 问题

投递详情的「通知目标元数据」标签页显示的**不是**这次投递使用的配置，而是**读取这一页时**
该目标的当前运行配置：

- `delivery.repository.ts:502-504` 在 `get()` 里用 `this.destinations.get(job.destinationId)`
  取目标的**当前**行，再交给 `destinationMetadataFromRuntime` 投影。
- `delivery-detail-view.tsx:57-62` 把结果当普通 JSON 块渲染，标题只写「通知目标元数据」。
- Tocsin 不保存投递时的配置快照，因此运维改过 endpoint、收件人或模板后再回看旧投递，
  会看到今天的配置，却以为那是当时真正发出去的配置。

这在排障时是**误导性证据**：值班人员根据错误的 endpoint 判断「发到了错的群」，
或根据当前收件人列表判断「当时没人收到」。同一页面的加急呼叫说明已经有
`deliveries.detail.pingsExplanation.currentConfigNote`（「基于目标当前配置…」）这层语义，
唯独元数据块没有。

## 用户故事

作为值班运维，我回看一条历史投递的元数据时，需要一眼看出这是**当前配置**而不是投递时的
快照；如果目标在投递之后被修改过，我希望页面明确提示「投递后已修改」，这样我不会把今天的
配置当成当时的证据。

## 范围

- `DeliveryDetail` DTO 增加 `destinationUpdatedAt`（来自既有的 `destinations.updated_at`，
  无迁移、无新表）。
- `DestinationRuntimeConfig` 增加 `updatedAt`，由 `destinationRuntimeFromRow` 从
  `row.updated_at` 投影。
- 投递详情「元数据」标签页：
  - 标题改为明确表达「当前配置」（中英文案同步）。
  - 当 `destinationUpdatedAt` 晚于本次投递的完成时间（`job.finishedAt`，缺失时退回
    `job.createdAt`）时，渲染警示条：目标在本投递之后被修改，以下为当前配置而非投递时快照。
- 新增组件测试与仓储测试覆盖「投递后已修改 / 未修改」两条路径。

## 非目标

- 不保存配置历史或投递时快照（配置快照见 backlog REQ-28）。
- 不做配置 diff 展示。
- 不改变发送路径、投递状态机、路由或抑制语义。
- 不改变其他页面的目标配置展示（目标列表仍按既有运营可见口径）。

## 验收标准

1. `DeliveryDetail` 返回 `destinationUpdatedAt`，等于目标的 `destinations.updated_at`
   （仓储测试断言）。
2. 目标 `updated_at` 晚于投递 `finishedAt`（或 `createdAt`）时，投递详情出现
   `deliveries.configNotice.title` 警示条，含目标修改时间与本次投递时间。
3. 目标未被修改时，不渲染该警示条。
4. 元数据块标题在中英文下都明确表达「当前配置」。
5. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 改动限于 DTO 投影、SQLite 仓储映射与 `features/deliveries/ui` 展示层。
- 不触碰推送/路由/鉴权语义，不新增依赖，不新增可部署服务。
- 无迁移；回滚只需还原代码，已存在的行不受影响。
