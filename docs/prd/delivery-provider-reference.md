# 投递外部消息引用

- 状态：已实现（2026-10-18）
- 来源：`docs/planning/iteration-backlog.md` REQ-47
- 相关：`docs/adr/0002-curated-adapter-extension-model.md`、`docs/adr/0009-oncall-feishu-urgent.md`

## 问题

投递成功时，目标适配器可以把目标系统里的消息句柄写进 `providerReference`
（例如飞书应用的 `feishu_message_id`），console 会将其落库并投影进
`DeliveryDetail`。这个句柄是运维在目标系统里定位消息、核对送达内容、以及后续
二次操作（手动加急）的关键标识，也是工单里最常被粘贴的一段信息。

但投递详情页没有渲染它。运维只能看到「加急」按钮是否可用，看不到它依赖的消息
引用本身；发生「加急打给了错误消息」或「在飞书里找不到这条消息」时，只能去查
数据库或调用 API。

## 用户故事

作为值班运维，我打开一条已成功的投递详情时，希望能直接看到目标系统返回的消息
引用及其类型，并能一键复制，这样我可以立刻在飞书里定位消息、贴进工单或用于排障。

## 范围

- 在投递详情「摘要」标签页的字段列表中展示外部消息引用：
  - 引用值作为可复制代码行展示，带复制按钮与完整值 tooltip。
  - 引用类型（如 `feishu_message_id`）作为次要的机器可读标注展示，不翻译。
  - 没有引用时显示 `-`，且不渲染复制按钮（避免复制占位符）。
- 中英文案同步。

## 非目标

- 不新增 oRPC procedure、DTO 字段或数据库列；`DeliveryDetail.providerReference`
  已经存在并且标注为非 secret。
- 不改变加急按钮的可用性判定或加急语义。
- 不在列表页展示消息引用（列表 DTO 不包含该字段）。
- 不提供消息引用的反向查询或目标系统跳转链接。

## 验收标准

1. 当 `providerReference = { type, value }` 时，摘要字段列表显示引用值、引用类型，
   并提供一个可访问名称为「复制外部消息引用」/「Copy external reference」的复制按钮。
2. 复制按钮复制的是引用值本身，不包含类型标注。
3. 当 `providerReference = null` 时，显示 `-`，且不存在复制按钮。
4. 中英文文案均存在；机器值 `type` 不进入翻译资源。

## 架构边界

- 纯前端改动，位于 `features/deliveries/ui/`；复用
  `components/common/copyable-code-line` 与既有 `DeliveryDetailTerm`。
- 服务端 DTO（`packages/api/src/schemas/operations.ts` 的 `DeliveryDetailSchema`）
  无需修改，浏览器代码继续只通过特性层查询选项读取数据。
- 不引入新的运行时依赖，不改变单进程、SQLite-first、自托管形态。
