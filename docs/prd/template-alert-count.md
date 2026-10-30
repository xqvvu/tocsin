# 通知模板暴露告警组规模 `tocsin.alertCount`

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` 的 `REQ-369`（requirements 车道第 188 轮）；
上游边界已由 `apps/docs/integrations/providers.md` 记录。

## 1. 问题

Alertmanager 兼容上游（Alertmanager、Grafana、SigNoz）按**通知组**发送：一个组里可能
有 5 条 alert，但 Tocsin 的解析器只把首条 alert 规范化成 Event，其余仅记录数量
（`packages/providers/src/shared/alertmanager-compatible.ts:35-36,63`、
`packages/providers/src/grafana/parse.ts:63`）。这个数量已经写进 Event 的
`providerMetadata.alertCount`，事件详情页也已经把它展示成「告警条数」
（`apps/console/src/features/events/model/event-upstream-source.ts:19`，
文案 `apps/console/src/i18n/messages/zh-Hans.json:840`）。

但**通知模板读不到它**：模板上下文是一份显式白名单
（`packages/destinations/src/template.ts:95-143`），`tocsin` 命名空间下只有
`eventUrl` 与 `deliveryUrl`。于是值班群里收到的是「1 条告警的正文」，看不出这一组
其实有 5 条——最需要判断「是不是大面积故障」的那一刻，恰恰缺少规模信息。

文档此前只承认这个边界（`apps/docs/integrations/providers.md:165`），没有给出可用的
表达方式。

## 2. 用户故事

作为值班 SRE，我希望在通知模板里写出「本组共 N 条告警」，这样群里能一眼看出
这是一次单点抖动还是大面积故障，而不必回到 Tocsin 打开事件详情。

## 3. 范围

- `DestinationRenderInput` 新增可选 `alertCount?: number`
  （`packages/destinations/src/types.ts`）。
- 新增模板变量 `tocsin.alertCount`：
  - 上游报告了正整数时渲染该数字（单条 alert 渲染 `1`）；
  - 上游不报告（provider 没有组概念、载荷解析不出数量、Event 早于该字段）时渲染空字符串；
  - 内置合成样例没有上游，渲染空字符串。
- 白名单、变量面板与未知变量诊断自动跟随：`TemplateVariablePaths` 由 resolver 表
  生成（`packages/destinations/src/template.ts:213-228`），面板按前缀分组，无需改面板。
- 三处渲染入口统一从一个 helper 取值，保证「预览 / 预演 / 真实投递」一致：
  - 真实投递：`apps/console/src/server/deliveries/delivery-execution.ts`
  - 目标预览（历史 Event）：`apps/console/src/server/destinations/destination.service.ts`
  - 告警源预演：`apps/console/src/server/sources/source-rehearsal.service.ts`
- `@tocsin/core` 新增 `readProviderAlertCount(providerMetadata)`
  （`packages/core/src/event/event.ts`）：只接受正的安全整数，其余一律 `undefined`
  ——不猜、不把非法值渲染成 `NaN` 或 `1`。
- 文档：变量表补一行（`apps/docs/integrations/destinations.md`），
  provider 边界段落补出用法（`apps/docs/integrations/providers.md`）。

## 4. 非目标

- 不拆分通知组：一个组仍然只产生一个 Event / 一条 Delivery，匹配、去重、抑制语义不变。
- 不把 `alertCount` 加进 `NormalizedEvent`，也不改路由规则：它不是告警内容，只是上游元数据。
- 不暴露其它 `providerMetadata` 字段（`groupKey`、`externalURL` 等需要单独评估脱敏与语义）。
- 不做「告警组展开」UI、不改事件详情、不改模板语法。
- 无 schema 变更、无迁移、无新依赖、无环境变量。

## 5. 验收标准

1. 模板写 `本组共 {{tocsin.alertCount}} 条告警`，上游 `alertCount=5` 时渲染
   `本组共 5 条告警`；变量面板能搜到 `tocsin.alertCount`。
2. 上游没有数量、或使用内置合成样例时，同一模板渲染 `本组共  条告警`（空串），
   而不是 `1` 或报错。
3. 真实投递路径把 `providerMetadata.alertCount` 传给 adapter 的 send 输入；
   未报告时为 `undefined`（`delivery-execution.test.ts`）。
4. 告警源预演把解析器报告的条数传给预览（`source-rehearsal.service.test.ts`）。
5. 历史 Event 预览渲染该条数，内置样例渲染空串
   （`configuration.integration.test.ts`）。
6. `readProviderAlertCount` 对 `0`、负数、小数、`NaN`、字符串、缺失字段一律返回
   `undefined`（`packages/core/src/event/event.test.ts`）。
7. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 6. 架构边界

- 纯加法：新增可选输入字段、新增模板变量、新增只读 helper；`DestinationTemplateContextSchema`
  的新字段带 `.default("")`，早先序列化的上下文仍能解析。
- 不碰投递状态机、路由匹配、抑制、鉴权、secret 处理与数据库 schema。
- 变量值是一个计数，不是载荷内容，不经过脱敏；原始载荷仍然只以
  `payload.*`（已递归脱敏）暴露。
- 可逆：回滚任一文件即可，无数据副作用。
