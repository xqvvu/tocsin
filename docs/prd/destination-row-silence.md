# 通知目标行临时静默

> 状态：已交付。以下「问题」段保留交付前的现状记录。

## 问题

- 抑制规则的能力已经支持「只静默某个通知目标」：`SuppressionMatcherSchema`
  原生包含 `destinationIds`（`packages/core/src/suppression/suppression.ts:32-34`），
  接入侧按投递目标逐条求值（`packages/core/src/suppression/suppression.ts:209`）。
- 但通知目标列表的行操作只有测试、预览、编辑、启停、删除
  （`apps/console/src/features/destinations/ui/destination-actions.tsx:68-105`），
  没有创建目标级静默的入口。
- 结果是：当某个通知目标刷屏或下游故障时，值班 SRE 必须离开目标列表，进入
  「静默规则」页手工新建规则、再在目标多选里翻找该目标。多一步跳转，且容易漏选或误选。

## 用户故事

- 作为值班 SRE，当某个飞书群或 Webhook 目标正在刷屏、或下游持续报错时，
  我希望直接在该目标所在行创建一条只作用于它的临时静默窗口，
  其他目标与路由的投递完全不受影响。
- 作为值班 SRE，我保存前仍能调整静默窗口与匹配条件，因为静默会比当前事件活得更久。

## 范围

- 通知目标行操作新增「临时静默」入口（保留现有 5 个动作，不改变它们的语义）。
- 对话框复用现有 `CreateSuppressionForm`：
  - 预填 `matcher.destinationIds = [目标 id]`，其余匹配维度为空；
  - 预填 2 小时默认窗口与规则名（可编辑）；
  - 告警源与目标选项列表按需加载，加载失败可关闭重试。
- 保存成功后失效抑制查询并提示；失败保留对话框与表单内容。
- 中英文文案同步。

## 非目标

- 不做目标级永久 mute；不改变抑制 matcher 的语义或求值路径。
- 不做快捷时长（30m/1h/4h/24h）；默认窗口仍为 2 小时。
- 不新增 oRPC procedure、数据库字段或迁移。
- 不改变投递、路由、auth 的核心语义。

## 验收标准

- 目标行存在「临时静默」动作，打开后目标多选中仅当前目标被选中。
- 提交后调用既有 `suppressions.create`，`matcher.destinationIds` 恰好包含该目标，
  其他匹配维度为空。
- 保存成功后关闭对话框并失效 `suppressions` 查询；失败时对话框保持打开并显示错误。
- 组件测试覆盖预填与提交两条路径；模型测试覆盖默认值构造。
- 中英文 i18n key 对等。

## 架构边界

- `apps/console/src/features/suppressions/ui`：新增目标行静默对话框（复用创建表单）。
- `apps/console/src/features/suppressions/model`：新增默认值构造函数，紧邻既有
  `suppressionDefaultsFromEvent` / `FromLabel` / `FromText`。
- `apps/console/src/features/destinations/ui`：在行操作中接入对话框。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/`、`infra/`、`packages/api`、数据库或投递语义改动；单进程 SQLite-first 假设不变。
