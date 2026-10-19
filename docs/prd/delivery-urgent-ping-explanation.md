# 投递详情解释「加急为什么没有发生」

状态：已实现（第 30 轮，对应 backlog REQ-124）

## 问题

自动电话加急是一条由多个静默 gate 组成的链路，任一条件不满足就直接 `return`，不写任何记录：

- 通知目标不是飞书（`apps/console/src/server/oncall/oncall.service.ts:134-136`）；
- 飞书配置解析失败（`oncall.service.ts:140-144`）；
- 发送模式不是应用模式，或未开启自动加急（`oncall.service.ts:147-149`）；
- 告警状态不是 `firing`（`oncall.service.ts:151-153`）；
- 告警级别不在目标允许的加急级别内（`oncall.service.ts:155-159`）；
- 同一指纹、目标、呼叫对象仍在去重窗口内（`oncall.service.ts:168-186`）。

投递详情页的「电话加急」标签在没有任何呼叫记录时只显示一句「该投递没有加急呼叫」
（`apps/console/src/features/deliveries/ui/delivery-pings-table.tsx:50-54`）。值班 SRE 看到
空列表无法判断是「本来就不该呼叫」「配置没开」还是「触发失败」，只能逐个打开通知目标配置
对照，排障成本高，也容易误以为加急功能坏了。

## 用户故事

作为一名值班 SRE，我打开一条没有电话加急记录的投递时，希望直接看到自动加急为什么没有发生，
并能区分「告警状态/级别不满足」「目标未开启或没配呼叫对象」「发送模式不支持」和
「条件都满足但可能被去重」，从而决定是改配置、手动加急还是继续排查。

## 范围

- 投递详情 DTO 的 `destinationMetadata` 增加自动加急判定所需的只读字段：
  `urgentAutoEnabled`、`urgentReceiverCount`（缺失时显式 0）、`urgentSeverities`
  （`apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts:190-206`）。
- 新增纯函数 `explainMissingUrgentPings`，按触发链路顺序返回第一个阻断原因：
  非飞书、投递未成功、Webhook 模式、缺少飞书消息引用、未开启自动加急、没有呼叫对象、
  告警未触发、级别被排除、其余情况归为「可能被去重或触发失败」
  （`apps/console/src/features/deliveries/model/urgent-ping-explanation.ts`）。
- 「电话加急」标签在无呼叫记录时渲染说明面板，展示原因与「依据目标当前配置判断」的提示；
  有呼叫记录时行为不变（`apps/console/src/features/deliveries/ui/delivery-urgent-ping-explanation.tsx`）。
- 中文与英文文案同步。

## 非目标

- 不改变自动加急的触发条件、去重窗口、投递状态机或任何发送语义。
- 不记录触发时的配置快照，不新增表、列或迁移。说明基于通知目标当前配置；
  面板会明确提示配置变更后历史投递的说明可能不同。
- 不展示被去重的接收人明细，不新增加急统计接口。
- 不替代手动加急入口；原因说明只做只读解释。

## 验收标准

1. 非飞书目标、投递未成功、Webhook 模式、缺少消息引用、未开启自动加急、没有呼叫对象、
   告警未触发、级别被排除时，分别显示对应中文原因，且不显示空表。
2. 全部 gate 通过但没有呼叫记录时，说明可能被去重窗口拦截或触发过程失败。
3. 已有呼叫记录时仍渲染原有呼叫表格，不出现说明面板。
4. `destinationMetadata` 不包含签名密钥、应用密钥或任何凭据值。
5. 纯函数对每个原因与判定顺序有单元测试；投递详情组件有无呼叫记录两种渲染测试。

## 架构边界

- 只读投影：改动集中在 SQLite 仓储的元数据投影、feature `model/` 纯函数与 feature `ui/`
  组件，不触碰 service 的触发逻辑。
- `destinationMetadata` 属于投递详情 DTO 既有字段，契约 schema 不变，无迁移。
- 说明函数为环境中立的纯函数，不导入 server-only 模块。
