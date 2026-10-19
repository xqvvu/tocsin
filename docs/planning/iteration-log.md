# 自主迭代日志

按轮次倒序追加。每条记录：时间、基线、专家发现、本轮交付、上报事项、下一轮优先项。

## 2026-10-19（第 18 轮）

- 时间：2026-10-19 13:27 – 14:30 CST。
- 基线：`origin/main` @ `ab3a4c4`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 三车道审计**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `architecture`，三条车道均返回。
  下一轮建议 `requirements` + `docs-drift` + `security-exposure`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `determined-hopper-bc917b`；收尾时删除其 `node_modules` 与 `agent-iteration`。
- 依赖：会话工作树 `node_modules` 链接残缺，`vp install` 报 “Already up to date” 后仍缺
  `@rolldown/plugin-babel`；按既有经验整体删除后重装解决。

### 本轮交付

- PR #146（`feat(console): explain why a route selected a delivery`）—— **REQ-80**。
  - 投递详情摘要页并列展示「接入时快照」与「当前规则」，逐项检查徽章复用同一组件；
    区分无快照、快照不含该路由、快照未命中三种事实；当前规则不再命中时显式提示。
  - 手动投递不渲染该区块；摘要页改为可滚动容器。
  - 路由检查/命中徽章抽到 `features/routes/ui/`，事件详情页同步复用；文案迁到
    `routeChecks.*` 命名空间。
  - PRD `docs/prd/delivery-route-match-evidence.md`；新增 8 条组件用例。
  - 合并后补 `fix(console): describe a disabled route as disabled`：停用路由不再显示
    「无此条件」。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4 包（console 109 files / 578 tests）；
    `vp run -r build`；PR CI green；rebase 合并 `f0456f5`。

### requirements lane（新增 7 条，已写入 backlog）

- **REQ-86（28）**：事件详情展示上游告警回链与接入元数据；`providerMetadata` 已含
  `externalURL`/`generatorURL`（`alertmanager-compatible.ts:59-76`、`grafana/parse.ts:59-71`），
  但事件页只渲染 normalized 与 raw，需 URL 协议白名单与 `noopener`。
- **REQ-87（28）**：投递详情原始事件载荷与渲染载荷对照；`DeliveryDetail` 已含两端
  （`delivery.repository.ts:445-483`），需派生 `rawPayloadPruned` 并过滤清理哨兵。
- **REQ-88（27）**：事件列表显示 `occurredAt` 与接入延迟；列表 DTO 只有 `receivedAt`
  （`schemas/operations.ts:37-49`），详情已有发生时间。
- **REQ-89（27）**：投递重试二次确认；列表/详情一次点击即发送
  （`delivery-actions.tsx:25-37`、`delivery-retry-button.tsx:27-31`）。
- **REQ-90（27）**：自托管指标 scrape 端点；只有 health/ready
  （`health.ts:5-13`、`ready.ts:6-53`），建议只读 `GET /api/metrics`、无新依赖。
- **REQ-91（26）**：操作列表相对时间与数据新鲜度；全站绝对时间
  （`operation-format.ts:31-47`），含 `dataUpdatedAt`。
- **REQ-92（25）**：配置表单未保存离开护栏；四个对话框只检查 pending
  （`destination-edit-dialog.tsx:49-55` 等）。
- 配置列表分页入 URL 未单列：与 ARCH-30 重复，已在 ARCH-30 备注中合并证据。

### quality lane（新增 6 条 + 3 处证据更新）

- **Q-30（26，HIGH）**：加急呼叫 `markFired` 持久化失败会落可重试分支
  （`oncall-execution.ts:98,115-130,161-180`），电话已拨出仍会重复呼叫；无失败注入测试。
- **Q-31（23）**：`buzzDelivery` 逐条入队无事务（`oncall.service.ts:91-109`），部分失败时
  已入队 ping 仍会被呼叫。
- **Q-32（22）**：`toLocaleLowerCase()` 依赖宿主 locale（`normalization.ts:5,23`、
  `route.ts:325,330`、`intake.service.ts:406,409`），土耳其语环境会漏投。
- **Q-33（23）**：Webhook 先查 source/启停再验 token（`intake.service.ts:62-77`），
  可区分未知/已知/停用。
- **Q-34（20）**：`formatTime` 对损坏时间戳抛 `RangeError`
  （`operation-format.ts:31-47`），单条脏数据会让整页不可用。
- **Q-35（17）**：ping 表测试用破折号数量代理列完整性
  （`delivery-pings-table.test.tsx:45`）。
- 证据更新：Q-10 同构于 oncall worker（`oncall-worker.service.ts:77-79,87-95`）；
  Q-5 的损坏 JSON 还覆盖 raw/provider/labels/rendered 列；Q-8 的加急对应物单列为 Q-30。

### architecture lane（新增 8 条）

- **ARCH-27（24）**：Provider catalog/`iconName` 无消费者，Source UI 硬编码
  （`source-provider-icon.tsx:1-40`、`source-form.tsx:57-67,149-158`）。
- **ARCH-28（21）**：Operations DTO 在 core 与 api 双份定义，无 parity 守卫
  （`packages/core/src/operations.ts:120,132`、`packages/api/src/schemas/operations.ts:37-111`）。
- **ARCH-29（21）**：`configuration-support.ts` 成为跨能力 helper 集散地，被 7 个服务导入。
- **ARCH-30（21）**：`OperationsTable` 分页固定在本地 state（`operations-table.tsx:58-62`），
  配置列表刷新/后退回第 1 页。
- **ARCH-31（20）**：契约与 runtime 的 auth 错误文案双份维护（`dashboard-auth.ts:5-15`）。
- **ARCH-32（19）**：Events/Deliveries 无自有 api/model 边界，`operations` 成为数据中枢。
- **ARCH-33（19）**：两个新增死组件（`form-text-field.tsx`、`destination-kind-badge.tsx`）。
- **ARCH-34（19）**：Scaffold 模板与 generic-webhook 能力分叉
  （`scaffold/schema.ts:8-13`、`generic-webhook/schema.ts`）。
- 证据更新：FIX-5/9/10 仍成立；ARCH-1/2/10 规模未变；ARCH-26 引用面扩大。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项。REL-13（LICENSE）继续 `blocked-autonomous`。
- Q-30 建议下一轮交 EXPERT_PANEL：涉及加急呼叫语义（已拨出后的持久化失败处理），
  需要安全与可靠性专家裁决。

### 其他

- 浏览器验证：未执行；本机 6180 的 dev server 运行主 checkout 的上一版代码，
  本切片行为已由 jsdom 组件测试覆盖。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，同步 `Vane Iteration Backlog.md`、
  `Vane Iteration Log.md`，新增 `Vane Delivery Route Match Evidence.md`，并更新 `Vane Index.md`。
- 本轮 backlog/log 随 docs PR 提交。

### 下一轮优先项

1. **REQ-86（28）**：事件详情上游告警回链与接入元数据。
2. **REQ-87（28）**：投递原始/渲染载荷对照。
3. **Q-30（26，HIGH）**：加急呼叫持久化失败重复呼叫；EXPERT_PANEL。
4. **REQ-65/66/73/58**（28）：静默提示、外部消息引用反查、时区语义、重试耗尽。
5. **REL-3 + REL-15/18**：Docker smoke 隔离与发布手册。
6. **Q-32**（22）：`toLowerCase` 归一化与边界用例。
7. **SEC-2/3/4/6**：可合并一个安全小修复 PR。

## 2026-10-19（第 17 轮）

- 时间：2026-10-19 12:40 – 13:30 CST。
- 基线：`origin/main` @ `9a4013c`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `security-exposure`，三条车道均返回。
  下一轮建议 `requirements` + `quality` + `architecture`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `peaceful-perlman-1093ae`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #143（`feat(console): confirm manual urgent calls with receiver count`）—— **REQ-72**。
  - 确认对话框展示接收人数与「立即拨号、不可撤销」；取消不产生请求；接收人数为 0 时
    按钮禁用并说明；保留「非飞书应用投递不可加急」文案。
  - PRD `docs/prd/oncall-buzz-confirmation.md`；5 条组件测试覆盖确认/取消/无接收人/非应用/失败。
  - 验证：`vp check` 0 errors；`vp run -r test` 108 files / 570 tests；`vp run -r build`。
- PR #144（`fix(console): share the intake prune sweep across requests`）—— **Q-24**。
  - 单飞状态移至 container 持有的 `RawPayloadSweepGate`，注入每个按请求创建的实例；
    双实例并发只触发一次后台清理，释放后下一个 webhook 可再次触发。
  - 验证：同上门禁。

### requirements lane（新增 6 条，已写入 backlog）

- **REQ-80（29）**：投递详情解释「为什么命中这条路由」；DTO 已含 `route.rule` 与
  `event.routeMatches[].checks`（`packages/core/src/operations.ts:132-144`、
  `packages/core/src/event/event.ts:7-17`），页面只渲染路由名
  （`delivery-summary-tab.tsx:24-27`）；需并列「接入时快照」与「当前规则」。
- **REQ-81（27）**：告警源行一键临时静默；`source-actions.tsx:21-34` 只有编辑/轮换/启停/删除，
  matcher 原生支持 `sourceIds`（`suppression.ts:155-179`）。
- **REQ-82（25）**：详情页跨域引用可导航并定位配置行；
  `delivery-summary-tab.tsx:16-31`、`event-detail-route-matches-table.tsx:62-66` 均为纯文本。
- **REQ-83（26）**：补投预览标注将被静默的目标；预览不判断抑制
  （`event-replay.service.ts:173-186,246-281`），实际入队会落 `suppressed`。
- **REQ-84（26）**：Settings 展示版本与 schema 版本；`system-information.ts:10-45` 已收集，
  但 `/api/health` 仅 `{status:"ok"}`（`health.ts:5-11`）。
- **REQ-85（21）**：配置变更审计；无审计表（`schema.ts:7-111`）、service 无 actor；
  需 forward-only migration，建议先写决策记录并交 EXPERT_PANEL。

### docs-drift lane

- **DOC-28**：`mvp-rc-checklist.md:18-20,103` 称 E2E/compose smoke 未接入 CI，`:125` 又勾选
  「故意不进 ci.yml」；实际 `.github/workflows/ci.yml` 只有 quality job，属表述冲突。
- **DOC-31**：retention 仍缺（`:18-20,107-109`）与 `:163` 已决定不自动清理矛盾。
- **DOC-30**：`route-authoring-current-state.md:101-118,224` 称无缺口解释/无 route×destination
  视图/多条件只能导入；`route-match-gaps.ts:57`、`event-detail-route-matches-table.tsx`、
  `route-forms.tsx:284+` 均已落地。
- **DOC-22**：`next-round.md` 正文仍把已完成的 S0、registry audit、test-kit 写成未决。
- 证据刷新：DOC-11/23/24/25/26/27/29/32；新发现
  `adapter-extensibility.md:118-119` 称脱敏由 `secretFields` 决定，实际仍由 console 手写
  （`destination.helpers.ts:233-260`、`config-portability.ts:442-455`），manifest 派生未落地。

### security-exposure lane

- **SEC-5 已完整落地**：导出整表删除 `config.headers` 并生成 refs
  （`config-portability.ts:344-381`）、不可表达名称 fail-closed、env 名冲突拒绝、
  陈旧 refs 裁剪、编辑 DTO 只返回名称、导入拒绝 `[REDACTED]`、preview/test 不含明文。
- 无 HIGH/MEDIUM。LOW 项：
  - SEC-6：`tokenHash` 未命中 `isSensitiveKey`（`redaction.ts:10-43`），当前无输出路径。
  - SEC-4：Feishu app test 错误未过 `redactText`（`feishu-app.service.ts:100-113`）。
  - SEC-3：`env.ts:9-12` 读 `process.env` 但无 server-only 标记。
  - SEC-2：脱敏测试按 registry 派生 kind（`configuration.integration.test.ts:18-20`）。
- 旧仓库名 `xqvvu/vane` 已无有效链接；仅 `route-authoring-current-state.md:3` 本地路径残留。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项。REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- 浏览器验证：未执行；本机 6180 的 dev server 运行在主 checkout 的上一版代码，
  组件行为已由 jsdom 测试覆盖（含 Radix AlertDialog 交互）。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，现有 Tocsin 笔记在
  `Vane/` 下；本轮同步 iteration backlog/log 与新增 PRD 笔记。
- 本轮 backlog/log 随 PR #145（`docs(planning): record the seventeenth iteration round`）
  提交，并顺手更正 DOC-28/30/31/32 四处已漂移的文档断言。

### 下一轮优先项

1. **REQ-80（29）**：投递详情解释路由命中。
2. **REQ-65（28）**：全局静默生效提示。
3. **REQ-66（28）**：按外部消息引用反查投递。
4. **REQ-73（28）**：静默时间窗时区语义。
5. **REQ-58（28）**：失败投递等待重试/重试耗尽。
6. **REL-3 + REL-15/18**：Docker smoke 隔离与发布手册。
7. **Q-26（25）**：抑制窗口时间比较。
8. **SEC-2/3/4/6**：可合并一个安全小修复 PR。

## 2026-10-19（第 16 轮）

- 时间：2026-10-19 08:59 – 12:40 CST（会话中途被系统挂起约 2.5 小时，车道在恢复后返回）。
- 基线：`origin/main` @ `27114f8`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 仍有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `architecture` + `release-infra`，三条车道均返回。
  下一轮建议 `requirements` + `docs-drift` + `security-exposure`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `elastic-hopper-f97c51`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #140（`feat(console): show oncall ping audit fields`）—— **REQ-53**。
  - 触发方式单元格显示 `initiatedBy`；新增呼叫时间（`firedAt`）与下次重试
    （`nextAttemptAt`）两列；空值统一 `—`；时间悬浮显示完整日期时间。
  - PRD `docs/prd/oncall-ping-audit-fields.md`；新增组件测试覆盖手动/自动/空列表。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4（console 565）；`vp run -r build`。
- PR #141（`fix(console): cap operation search at the contract limit`）—— **Q-21**。
  - `@tocsin/core` 导出 `OPERATION_SEARCH_MAX_LENGTH`，contract 与前端共用。
  - 搜索框 `maxLength` + `pruneSearch` 截断，覆盖手工编辑 URL；新增 3 条用例。
  - 验证：同上门禁。

### requirements lane（新增 8 条，已写入 backlog）

- **REQ-72（29）**：手动加急一键呼叫无确认；单击即呼叫目标全部接收人。
- **REQ-73（28）**：静默时间窗表单按浏览器时区解释，列表按设置时区显示，跨时区会偏数小时。
- **REQ-74（27）**：Events/Deliveries 排序方向。
- **REQ-75（26）**：静默详情页缺启停/编辑/删除/续期入口。
- **REQ-76（25）**：加急可用性预判（无 urgent 接收人时仍可点）。
- **REQ-77（25）**：投递诊断摘要一键复制。
- **REQ-78（25）**：列表搜索逐键请求，无防抖。
- **REQ-79（24）**：设置保存无条件整页刷新。

### architecture lane（新增 ARCH-20..26）

- **ARCH-20（25）**：Destination secret path 策略在 manifest、repository、portability
  三处重复，manifest `secretFields` 未被消费（`destination.helpers.ts:233`、
  `config-portability.ts:428`）。
- **ARCH-21（21）**：编辑器草稿映射（header 行、收件人拼接）落在 SQLite repository helper。
- **ARCH-22（21）**：纯领域逻辑 `route-match-gaps.ts` 落在 repository 目录。
- **ARCH-23（20）**：注入的 container 在 dashboard 会话解析中被绕过。
- **ARCH-24（17）**：core 模块契约仍在包根，与 AGENTS 的 `<module>/` 约定不一致。
- **ARCH-25（18）**：空条件确认对话框在 routes/suppressions 重复实现。
- **ARCH-26（18）**：feature `model/` 混入 React hook 与 i18n 上下文。
- ARCH-1 证据更新：`route-forms.tsx` 已增至 1027 行。

### release-infra lane（新增 REL-15..19、DOC-33）

- REL-3/6/7 证据未变；实测 `docker compose -p tocsin-smoke config` 仍解析为
  `tocsin:local` / `tocsin-data`；Playwright 期望 1248、缓存 1234。
- **REL-15（24）**：发布手册的手工 Docker 冒烟直接作用于正常栈。
- **REL-16（21）**：main 无 branch protection/ruleset，CI 不是强制门禁。
- **REL-17（22）**：`.dockerignore` 漏掉 Playwright 产物与 `.wt/`，trace 可能含 Source token。
- **REL-18（23）**：发布手册 readiness 无重试。
- **REL-19（23）**：本地 E2E `retries=0` + `trace: on-first-retry`，失败无 trace。
- **DOC-33（21）**：RC 未勾选 gate 实为 4 条，历史记录漏算 provider 多版本 payload。

### EXPERT_PANEL

- 本轮无 EXPERT_PANEL 事项。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- 浏览器验证：未执行。本机 6180 端口的 console dev server 运行在主 checkout
  `27114f8`（不含本轮改动），且 dev 配置 `strictPort`；组件行为已由 jsdom 测试覆盖。
- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，沿用 `Vane/` 下的
  `Vane <Title>.md` 命名与 `## Related` wikilink 风格。已同步 `Vane Iteration Log`、
  `Vane Iteration Backlog`，新建 `Vane Oncall Ping Audit Fields` 并更新 `Vane Index`。
- 本轮 backlog/log 随 `docs(planning):` PR 提交。

### 下一轮优先项

1. **REQ-72（29）**：手动加急确认。
2. **REQ-65（28）**：全局静默生效提示。
3. **REQ-66（28）**：按外部消息引用反查投递。
4. **REQ-73（28）**：静默时间窗时区语义。
5. **REQ-58（28）**：失败投递等待重试/重试耗尽。
6. **REL-3 + REL-15/18**：Docker smoke 隔离与手册。
7. **Q-24（27）**：prune sweep 单飞跨请求失效（真实缺陷）。
8. **Q-26（25）**：抑制窗口时间比较。

## 2026-10-19（第 15 轮）

- 时间：2026-10-19 07:42 – 09:00 CST。
- 基线：`origin/main` @ `5d49502`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**安全修复 + 需求切片 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST）；backlog 仍有大量 ≥27 分候选，按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `quality`，三条车道全部返回。
  下一轮建议 `requirements` + `architecture` + `release-infra`。
- 工作树：`agent-iteration` 仅用于并发锁与基线读取；实现与验证在会话工作树
  `nervous-varahamihira-86cc30`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #137（`fix(console): redact every destination header value from exports`）—— **SEC-5**。
  - 导出整表删除 `config.headers`，为每个 header 生成
    `secret_refs["headers.<Name>"]` 环境变量引用；编辑 DTO 只返回 `Name:`。
  - 不可表达为 secret path 的 header 名（`.`、`$`、空格）fail-closed；
    `slugEnvPart` 归一化后的 env 名冲突拒绝导出；陈旧 `headers.*` refs 导出前裁剪；
    导入侧拒绝 header 值等于 `[REDACTED]`。
  - 决策记录：`docs/planning/decisions/destination-header-redaction.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 107 files / 559 tests；`vp run -r build`。
- PR #138（`feat(console): confirm routes that match every alert`）—— **REQ-57**。
  - `routeRuleIsEmpty` 按归一化后的保存规则判定；新建/编辑路由提交前弹出
    catch-all 确认对话框，取消不提交。
  - PRD：`docs/prd/route-catchall-confirmation.md`。
  - 验证：`vp check` 0 errors；`vp run -r test` 107 files / 561 tests；`vp run -r build`。

### requirements lane

新增 6 条候选（已写入 backlog）：

- **REQ-65（28）**：全局静默生效提示；其他页面会把 catch-all 静默误判为系统健康
  （`dashboard-header.tsx:29-47`、`suppression.ts:82-105`）。
- **REQ-66（28）**：按外部消息引用反查投递；搜索谓词不含 `provider_ref_value`
  （`history.repository.ts:435-455`、`schema.ts:126-127`）。
- **REQ-67（27）**：事件列表解释「命中路由但 0 投递」
  （`event-delivery-counts-cell.tsx:35-55`、`events-table.tsx:72-80`）。
- **REQ-68（26）**：路由一键复制（`routes-section.tsx:161-223`、`route-forms.tsx:50-87`）。
- **REQ-69（25）**：新建/编辑静默时提示重叠规则（`suppression-forms.tsx:209-228`）。
- **REQ-70（25）**：出站投递支持 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`
  （`transport.ts:72-77`、`Dockerfile:75`）；涉及启动参数，需 EXPERT_PANEL。

### docs-drift lane

新增 DOC-29..DOC-32，并补充 DOC-11/22/23：

- `next-round.md:3` 基线 `2f48153`（落后 18 提交），backlog「已知过期输入」仍写
  `7b5d501`（DOC-29）。
- `route-authoring-current-state.md:101,103-118,224` 仍称无缺口解释/无 route×destination
  视图/多条件只能导入，实际已落地（`route-match-gaps.ts:57`、
  `event-detail-route-matches-table.tsx:35-40`）（DOC-30）。
- RC checklist `:18-20,107-109` 与 `:163` 对 delivery history retention 自相矛盾（DOC-31）。
- `alert-suppression-decisions.md:167-168` 称参数化脱敏测试未补，实际已存在
  （`configuration.integration.test.ts:18-19,29-45,1175-1212`）（DOC-32）。
- 另确认 SEC-5（`mvp-rc-checklist.md:41-42` 的「无明文 secret」断言在修复前不成立）。

### quality lane

新增 Q-24..Q-29：

- **Q-24（27）**：`pruneSweepRunning` 是 per-request service 实例字段，单飞从未跨请求
  生效；并发 webhook 会叠加无界 `pruneAllRawPayloads`
  （`intake.service.ts:49-50,176-192`、`container.ts:268-274`、`webhook.ts:55`）。
- **Q-25（26）**：重放与历史样例预览把 `{"retentionPruned":true}` 当真实载荷
  （`event-replay.service.ts:49-81`、`delivery-execution.ts:95`、
  `destination.service.ts:371-390`）。
- **Q-26（25）**：抑制窗口用字符串字典序比较，带偏移 ISO 时间会超期静默或提前失效
  （`suppression.ts:82-97`、`suppression.service.ts:50-57`）。
- **Q-27（24）**：告警源覆盖率把条件路由算成全覆盖（`source-route-coverage.ts:16-31`）。
- **Q-28（22）**：oncall worker 批次共用开始时间，`fired_at` 与退避基准偏早
  （`oncall-worker.service.ts:77-79`、`oncall-execution.ts:97-98,138-143`）。
- **Q-29（20）**：历史样例选择器 pending/error/empty 三态无测试
  （`destination-notices.tsx:131,150-158`）。

### EXPERT_PANEL（SEC-5）

- 安全与可靠性专家、产品与运维专家、独立评估者三人一致推荐 **方案 A：全量遮蔽 +
  fail-closed**。
- 关键约束（均已实施）：不能按点路径逐条删除 header 值（header 名可含 `.`/`$`）；
  env 名冲突必须拒绝；陈旧 refs 必须裁剪；编辑留空=保留的 merge 语义不能破坏。
- 决策记录：`docs/planning/decisions/destination-header-redaction.md`。
- 回滚：`git revert`，无迁移、无数据改写。
- 残余项：编辑表单仍无法删除已有 header，已记入 `REQ-71`。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，现有 Tocsin 笔记在
  `Vane/` 下，沿用 `Vane <Title>.md` 命名与底部 `## Related` wikilink 风格。本轮同步
  `Vane Iteration Backlog`、`Vane Iteration Log`，新建
  `Vane Destination Header Redaction` 与 `Vane Route Catchall Confirmation`，并更新
  `Vane Index`。
- 本轮 backlog/log 与决策记录随本 `docs(planning):` PR 提交。

### 下一轮优先项

1. **REQ-53（29）**：加急记录审计字段；纯 UI。
2. **REQ-65（28）**：全局静默生效提示。
3. **REQ-66（28）**：按外部消息引用反查投递。
4. **Q-21（28）**：搜索输入 120 字符上限。
5. **Q-24（27）**：prune sweep 单飞跨请求失效；这是真实缺陷，建议优先于普通功能项。
6. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-19（第 14 轮）

- 时间：2026-10-19 01:25 – 04:15 CST。
- 基线：`origin/main` @ `871c629`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求发现 + 小修复 + 三车道审计**（非 full-audit）。最近全量审计仍为
  第 1 轮（2026-10-18 13:30 CST，距今约 12 小时）；backlog 仍有大量 ≥27 分候选，
  按第 1.5 步继续消化。
- 车道轮转位置：本轮跑 `requirements` + `release-infra` + `security-exposure`，
  三条车道全部返回（requirements 约 12 分钟、release-infra 约 6.5 分钟、
  security-exposure 约 8 分钟）。下一轮建议 `requirements` + `docs-drift` + `quality`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `festive-fermat-7d78d0`；收尾时删除其 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #136（`fix(console): rebuild legacy normalized events on read`）—— **Q-20**。
  - `0003` 用 `ADD COLUMN normalized_json TEXT NOT NULL DEFAULT '{}'` 修复旧库，
    历史事件的规范化对象恒为 `{}`，`eventFromRow` 解析抛 ZodError。
  - 受影响：事件/投递详情、事件重放、路由重放预览、oncall；更严重的是
    `claimNext` 在事务内解析事件，一条旧 pending 会让整批回滚并在每个 tick 重复，
    永久饿死新告警。
  - 修复：`normalized_json` 精确等于 `'{}'` 时，用 ingest 同一 INSERT 写入的
    `title/message/severity/status/fingerprint/labels_json/occurred_at` 重建；
    其它非法 JSON 仍抛错。无写库、无迁移、完全可逆。
  - 新增 `docs/planning/decisions/legacy-normalized-event-repair.md`，并在
    `docs/architecture/sqlite-store.md` 记录占位符语义。
  - 验证：`vp check` 0 errors（12 条既有 warning，新增 warning 已修）；`vp run -r test`
    4/4（console 555）；`vp run -r build` 通过；CI 绿后 rebase 合并。

### requirements lane

新增 8 条候选（已写入 backlog）：

- **REQ-57（29）**：Route 全空条件（catch-all）保存护栏。空规则会匹配所有告警，
  表单没有任何确认；抑制表单已有同类先例（`route.ts:17-49`、`route-form.ts:8-15`、
  `route-forms.tsx:231-238,463-470`、`suppression-forms.tsx:224-226,467-488`）。
- **REQ-58（28）**：失败投递区分「等待重试」与「重试耗尽」。列表 DTO 缺
  `maxAttempts`；`operations.ts:86-113`、`history.repository.ts:224-244,284-297`。
- **REQ-59（27）**：配置对象 → 过滤后历史一键钻取；复用现有 URL 参数
  （`operation-search.ts:12-23`、`source-actions.tsx:46-160`、`routes-section.tsx:185-265`）。
- **REQ-60（26）**：停用对象滞留投递的列表可见性与恢复预警
  （`delivery.repository.ts:215-232`、`delivery-retention-notice.tsx:1-20`）。
- **REQ-61（26）**：从投递详情按目标一键静默
  （`delivery-detail-page.tsx:38-60`、`suppression-from-event-dialog.tsx:38-68`）。
- **REQ-62（25）**：Dashboard 账户安全：修改密码与会话撤销
  （`dashboard-user-menu-impl.tsx:80-111`、`auth-options.ts:67-69`）。
- **REQ-63（25）**：Source 接入鉴权状态可见（仅派生布尔值）
  （`source.ts:9-14`、`edit-source-form.tsx:38-52`、`intake.service.ts:344-374`）。
- **REQ-64（25）**：Event/Delivery 详情 Tab 写入 URL
  （`event-detail-view.tsx:25-27`、`delivery-detail-view.tsx:23-25`）。

### release-infra lane

- REL-3/6/7/10/2/5 状态未变。新证据：
  - `docker compose -p tocsin-smoke config` 实测仍解析为 `image: tocsin:local`、
    `source: tocsin-data`；`-p` 不隔离显式卷名和镜像 tag（`docker-compose.yml:7,35-37`、
    `docker-smoke.sh:16-17,29,37`）。
  - `scripts/docker-smoke.sh:37` 先 `down -v`、`:42` 才抓日志，失败时日志必丢；
    三处 curl 无超时；`:92` 只用 `test -f`（REL-6 补充）。
  - E2E 实测：`playwright test --list` 通过，但完整运行因缺
    `chromium_headless_shell-1248`（缓存为 1234）立即失败；`just e2e` 没有安装步骤
    （`Justfile:78-79`）。Playwright 1.64.1 先启动 webServer 再跑 globalSetup，
    `global-setup.ts:13-18` 在服务已打开并迁移后删库（REL-7 补充）。
  - `backup-restore-upgrade.md:123` 的 registry 升级路径使用 `--build`，与 `:170`
    检查表矛盾（REL-10 补充）。
  - **DOC-28（24，新增）**：`mvp-rc-checklist.md:18-19,125,216` 对 E2E/compose smoke
    是否进 CI 的表述互相矛盾。
- CI flaky 核查：main 近 25 次 24 success + 1 cancelled（concurrency），无 failure/rerun。

### security-exposure lane

- **SEC-5（HIGH，新增）**：自定义 header 值在配置导出中明文出现。
  `destinationSecretPaths` 只把 `isSensitiveKey(headerName)` 命中的 header 加入 secret
  path（`config-portability.ts:334-347,391-404`），而 manifest 把整个 header map 声明为
  `valueSensitive` / `secretFields.path = "headers"`（`generic-webhook/manifest.ts:32-38,63-68`）。
  `X-Custom-Auth: Bearer ...` 会明文进入导出文件；编辑 DTO 同样回显
  （`destination.helpers.ts:395-413`）。需 EXPERT_PANEL 决定导出语义。
- **SEC-6（23，新增）**：`tokenHash` 不在 `isSensitiveKey` 覆盖内（纵深防御，当前无输出路径）。
- SEC-2/3/4 状态未变；import protection 构建无违规；其余 DTO、webhook 输入边界未发现新缺口；
  `xqvvu/vane` 仅存在于历史日志/backlog 文本，无有效链接。

### EXPERT_PANEL

- **Q-20**：安全与可靠性专家、产品与运维专家均推荐 A（仅读取容错）；独立评估者推荐
  C（回填 + 容错），备选 A。按「有分歧选最保守且可逆」实施 A。
  决策记录：`docs/planning/decisions/legacy-normalized-event-repair.md`。
  - 回滚：`git revert`，无数据库操作。
  - 残余风险：未来若出现直读 `normalized_json` 的消费者，需重新评估回填。
- **SEC-5** 于第 15 轮进入 EXPERT_PANEL（导出文件兼容性 + 脱敏语义），本轮不动。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- Obsidian 同步：从 `~/Library/Application Support/obsidian/obsidian.json` 发现 vault
  根目录 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents`，现有 Tocsin 笔记在
  `Vane/` 下，沿用 `Vane <Title>.md` 命名与底部 `## Related` wikilink 风格。已同步
  `Vane SQLite 存储层`（仓库文档的中文镜像）、`Vane Iteration Backlog`、
  `Vane Iteration Log`，并新建 `Vane Legacy Normalized Event Repair`、更新
  `Vane Index`。过期的英文摘要 `Vane SQLite Store` 已改为指向中文镜像的指针。
- 本轮文档变更（决策记录、架构说明、backlog/log）随 PR #136 提交。

### 下一轮优先项

1. **SEC-5（HIGH）**：自定义 header 导出泄露；先跑 EXPERT_PANEL 再实现。
2. **REQ-57（29）**：Route catch-all 保存护栏。
3. **REQ-53（29）**：加急记录审计字段。
4. **Q-21（28）**：搜索输入上限。
5. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-19（第 13 轮）

- 时间：2026-10-19 00:25 – 01:05 CST。
- 基线：起始 `origin/main` @ `b05e4a3`；执行中 main 前进到 `d0f80e5`
  （`chore: bump deps`），两个交付分支均已 rebase 到 `d0f80e5`。main 最近一次 CI 为
  success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST，距今约 11.5 小时）；backlog 仍有大量 ≥27 分候选，按第 1.5 步
  继续消化，不重跑全量审计。
- 车道轮转位置：本轮跑 `requirements` + `architecture` + `quality`，三条车道均返回
  （requirements 约 31 分钟、architecture 约 21 分钟、quality 约 31 分钟，后两者经催办
  返回）。下一轮建议 `requirements` + `release-infra` + `security-exposure`。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `goofy-bun-444b40`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #134（`feat(console): show alert identity in the deliveries list`）—— **REQ-27**。
  - `DeliveryListItem` / `DeliveryListItemSchema` 新增 `eventTitle`、`eventSeverity`、
    `eventStatus`；仓储复用既有 `events` join，不新增查询。
  - 投递列表「事件」列改为：严重程度徽标 + 告警标题；告警源 · 状态 · 事件 ID
    （`firing` 用语义 `text-destructive` 强调，`resolved` 中性）。
  - 新增中文 mini-PRD `docs/prd/delivery-event-identity.md`；新增仓储投影、schema
    枚举拒绝与单元格渲染测试；更新抑制命中与既有 schema fixture。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r typecheck` 2/2；
    `vp run -r test` 4/4（console 552 + providers 183 + destinations 31 + 7）；
    `vp run -r build` 通过；CI green。
  - 自查（code-review low）发现并修复 1 条 conventions 问题：`firing` 状态从原生
    `text-red-700` 改为语义 token `text-destructive`。
- PR #135（`docs(release): separate dedupe cleanup from bounded raw pruning`）—— **DOC-21**。
  - RC checklist 的已勾选 gate 收窄为 raw payload pruning；新增未勾选的 dedupe cleanup
    gate（`pruneDedupeKeys` 仍是无界 `DELETE`，且在每次 `enqueueForEvent` 内执行）。
  - `history-retention-and-snapshots.md` §2 增加「本节不覆盖 dedupe cleanup」说明。
  - 验证：`vp fmt --check` 通过；CI green。

### requirements lane

- **REQ-52（28）**：模板 `tocsin.eventUrl` 生产路径恒为空。所有渲染调用点未传
  `eventUrl`，且没有公开访问地址配置（`packages/destinations/src/template.ts:369-399`、
  `feishu/payload.ts:18`、`generic-webhook/payload.ts:18,41`、`slack/payload.ts:24,34`、
  `email/payload.ts:22,84,135`、`destination.service.ts:299`）。
- **REQ-53（29）**：加急记录缺 `initiatedBy` / `firedAt` / `nextAttemptAt` 展示；DTO 已有
  字段，纯 UI（`delivery-pings-table.tsx:28-41`、`oncall.ts:39-50`）。
- **REQ-54（27）**：告警源覆盖无法区分「没有路由」与「只有停用路由」
  （`source-route-coverage.ts:11-27`、`source-route-coverage-cell.tsx:22-30`）。
- **REQ-55（27）**：全静默事件摘要显示 0 成功 / 0 失败，未计入已抑制
  （`event-detail-stats.ts:3-15`、`event-detail-summary.tsx:43-49`）。
- **REQ-56（25）**：被抑制投递无逐项 match checks（PRD 故事 26；
  `suppression.ts:134-141,155-186`、`delivery-suppression-notice.tsx:20-60`）。
- 复核：REQ-48 / REQ-27 / REQ-32 / REQ-22 / REQ-24 / REQ-12 / REQ-13 均仍成立；
  DOC-11 剩余范围收窄为 F5；REQ-13 的 `testPayload` 是能力位而非样例 payload。

### architecture lane

- **ARCH-15（23）**：`runDeliveryWorker` 在 oRPC router 内编排 worker 与 health
  （`server/orpc/features/operations/router.ts:64-77`），应下沉为 service。
- **ARCH-16（22）**：auth 复杂表单仍在 `routes/-login-form-impl.tsx:27-173`、
  `routes/-setup-form-impl.tsx:23-207`，`features/auth` 只有 `api/`。
- **ARCH-17（23）**：`route-forms.tsx:809-811` 与 `components/ai-elements/code-block.tsx:404-423`
  直接使用 `document`/`navigator`/`window`，但无 client-only 标记；`code-block` 另有一套
  剪贴板路径，绕过 `#/lib/browser`。
- **ARCH-18（24）**：抑制详情命中分页保存在 React state
  （`suppression-detail-page.tsx:34,39,119`），未进 URL，刷新回第 1 页。
- **ARCH-19（25）**：Event/Delivery `DetailTerm` 近同构重复；delivery 版本用
  `wrap-break-word`，可能裁切 `fastgpt:<hex>:green:<iso>` 这类长引用
  （`delivery-detail-term.tsx:59`、`event-detail-term.tsx:52-59`）。
- 复核 ARCH-5 / 6 / 7 / 8 / 9 / 12 / 13 / 14、FIX-5 / FIX-9 / FIX-10、DOC-23 均仍成立；
  其余契约维度（service 纯度、容器、repository 拆分、包边界、i18n、import protection）
  clean。

### quality lane

- **Q-20（高）**：旧库升级后 `normalized_json` 未回填。`ensureOlderNullableColumns`
  仅执行 `ADD COLUMN ... DEFAULT '{}'`（`ensure-complete-schema.ts:114-120`），
  `eventFromRow` 直接 `decodeSchemaJson(NormalizedEventSchema, ...)`
  （`intake.helpers.ts:46-59`）。历史事件详情、引用旧事件的投递详情、含旧事件的路由
  重放预览都会因 ZodError 整页失败；列表页不受影响。迁移测试只检查列存在
  （`migrate.test.ts:227,333`），从未读回旧事件。需要 forward-only `0004` 回填 +
  迁移读回测试（下一轮 EXPERT_PANEL）。
- **Q-21（中，28）**：搜索框无 120 字符上限。`q` 的 schema 上限为 120
  （`packages/api/src/schemas/operations.ts:208`），但输入框无 `maxLength`，URL 归一化
  也不截断（`operation-filters.tsx:87-99`、`operations.queries.ts:87-102`）；超长粘贴或
  旧链接会让 loader 校验失败，整个列表变成错误页。
- **Q-22（低）**：外部引用/诊断复制按钮只测「存在」，不测复制内容；非 JSON 响应体回退
  分支无测试（`delivery-summary-tab.test.tsx:52-67`、`delivery-attempts-table.test.tsx:47-78`、
  `delivery-attempt-detail-dialog.tsx:151-185`）。
- 复核 Q-4 / 5 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 均仍成立。
- 另新增 **Q-23（25）**：DOC-21 暴露的 dedupe cleanup 无界 `DELETE` 仍在
  `enqueueForEvent` 热路径（`delivery.helpers.ts:98-99`、`delivery.repository.ts:95`）。

### EXPERT_PANEL

- 本轮无新增 EXPERT_PANEL 决策；未触碰 schema/迁移、secret 处理、投递/路由/auth 语义。
- **Q-20 建议下一轮进入 EXPERT_PANEL**：三位专家评估 forward-only `0004` 回填 +
  `eventFromRow` 降级策略。这是升级路径上的高严重度问题，但不在本轮交付范围内。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 其他

- Obsidian 同步已跳过：`obsidian-vault` skill 不在本会话可用 skill 列表中；本轮文档变更
  为发布与规划文档，已随 PR #135 提交。

### 下一轮优先项

1. **Q-20（高，P0）**：旧库 `normalized_json` 回填；先跑 EXPERT_PANEL，再实现
   forward-only `0004` 与迁移读回测试。
2. **REQ-53（29）**：加急记录审计字段，纯 UI。
3. **Q-21（28）**：搜索输入上限，含 URL 归一化与 121 字符用例。
4. **REQ-48（28）** / **REQ-52（28）**。
5. 补跑 `release-infra` + `security-exposure` 车道（`requirements` 每轮必跑）。
6. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-18（第 12 轮）

- 时间：2026-10-18 23:25 – 2026-10-19 00:10 CST（15:25–16:10Z）。
- 基线：`origin/main` @ `d09c5e2`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计仍为第 1 轮
  （2026-10-18 13:30 CST）；backlog 仍有多个 ≥27 分候选，按第 1.5 步继续消化，
  不重跑全量审计。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `architecture`。
  `docs-drift` 返回 19 条发现；`requirements` 与 `architecture` 运行约 35 分钟无输出，
  按车道限时规则停止，留待下一轮补跑。下一轮建议 `requirements` + `architecture`
  + `quality`（`requirements` 每轮必跑）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `eloquent-heyrovsky-98a971`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #131（rebase 合并 `04a408e`）`feat(console): show external message reference on delivery detail`。
  - **REQ-47**：投递详情「摘要」新增「外部消息引用」，展示可复制的
    `providerReference.value` 与机器类型（如 `feishu_message_id`）；无引用显示 `-`
    且不渲染复制按钮。扩展 `DeliveryDetailTerm` 的 `copyValue/copyLabel/hint`，
    复用 `CopyableCodeLine`。
  - 新增中文 mini-PRD `docs/prd/delivery-provider-reference.md`；中英文案同步；
    新增 2 条摘要测试。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test`
    console 546 + providers 183 + destinations 31 全绿；`vp run -r build` 通过。
- PR #132（rebase 合并 `605cb13`）`fix(console): use 告警源 consistently in Chinese source copy`。
  - **FIX-7**：事件列头、路由来源条件、抑制匹配器、通知目标模板变量分组共 10 处
    中文文案统一为「告警源」；保留「模板来源/样例来源」。
  - 验证：`vp check` 0 errors；`vp run -r test` 4/4 通过（console 544）。
  - 纯文案改动，无行为变更。

### docs-drift lane

共 19 条，已整理为 backlog `DOC-21..DOC-27` 并复核 `DOC-11`：

- **HIGH DOC-21（27）**：`docs/release/mvp-rc-checklist.md:164` 声称 dedupe cleanup
  已改为有界批；实际 `delivery.helpers.ts:98-99` 的 `pruneDedupeKeys` 无 `LIMIT`，
  仍是无界 `DELETE`，且与同文件 `:108-109` 自相矛盾。
- **DOC-22（25）**：`docs/planning/next-round.md` 仍把 S0 与抑制写成未决缺口；
  S0 已在 `config-portability.ts:358-370` 修复，抑制已于 2026-10-12 拍板并落地。
- **DOC-23（24）**：`frontend-architecture.md:37-108` 与 `application-container.md:57`
  的文件树/路由/工厂清单过期（缺 suppressions/integrations/oncall、csrf；
  `auth/router.ts` 实为 `session/router.ts`）。
- **DOC-24（24）**：`alert-suppression.md:238` 承诺不存在的 `preview` 过程
  （contract `suppressions.ts:21-63` 无此项，实为 REQ-25）；`:275-294` AC 全未勾选；
  `:289` 仍写「四状态」。
- **DOC-25（23）**：`post-mvp-planning.md:215` 称缺投递缺口解释，实际
  `routeMatchGaps` + `event-detail-route-gaps.tsx` 已上线；retention 已决定不自动清理。
- **DOC-26（22）**：`delivery-retention-notice.md:10-12`（#111）、
  `event-fingerprint-silence.md:5-7`（#116）、`raw-payload-pruned-state.md:9-12`（#118）
  仍用现在时描述已修复的问题。
- **DOC-27（20）**：ADR 0008 的 setup-vp/vite-plus 版本、ADR 0003 与 restructure-plan
  的 `server/functions/`、`route-authoring-current-state.md:3` 的旧 `devs/vane` 路径过期。
- 已确认：`docs/**` 中不再有 `xqvvu/vane` 链接；RC checklist 其余 `[x]` 均有代码支撑；
  两个未勾选项（E2E 接入 CI、provider fixtures）仍准确。

`requirements` 与 `architecture` 车道本轮未返回结果，未新增 REQ/ARCH 候选；
backlog 中既有候选全部复核为仍成立（`requirements` 车道因超时未能逐条复核）。

### EXPERT_PANEL

- 本轮无新增 EXPERT_PANEL 事项；未触碰 schema/迁移、secret 处理、投递/路由/auth 语义。
- REL-13（LICENSE）继续 `blocked-autonomous`。

### 下一轮优先项

1. **REL-3**（28，P0）：Docker smoke 隔离。
2. **REQ-48**（28）：配置删除影响预检。
3. **DOC-21**（27）：RC checklist 的 dedupe cleanup 断言；纯文档更正。
4. **补跑 requirements + architecture 车道**（本轮均超时无输出）。
5. 其余见 `iteration-backlog.md` 的「下一轮优先项」。

## 2026-10-18（第 11 轮）

- 时间：2026-10-18 22:32–23:17 CST（14:32–15:17Z）。
- 基线：`origin/main` @ `31627be`；main 最近一次 CI 为 success，无遗留 open PR。
- 本轮类型：**需求切片**（非 full-audit）。最近全量审计仍为第 1 轮（13:30 CST）；
  backlog 有多个 ≥27 分候选，按第 1.5 步继续消化高价值候选。
- 车道轮转位置：本轮按第 10 轮建议跑 `requirements` + `docs-drift` + `release-infra`。
  `release-infra` 返回完整结果；`requirements` 与 `docs-drift` 运行约 37 分钟仍无输出，
  按车道限时规则停止，留待下一轮补跑。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证在会话工作树
  `upbeat-wilbur-5e6119`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #130 `feat(console): search deliveries by error, destination, and route`。
  - **REQ-37**：`deliverySearchPredicate` 增加 `deliveries.last_error` 与目标/路由名称的
    关联 `EXISTS` 子查询；列表与计数继续共用同一谓词，计数不新增 join。
  - 搜索框占位文案按页面区分：Events 保持事件字段，Deliveries 承诺「错误、通知目标或路由」。
  - 新增中文 mini-PRD `docs/prd/delivery-search-fields.md`；同步修正旧 PRD 的非目标说明与
    RC checklist 的搜索状态。
  - 新增 3 条仓储搜索用例（失败原因、目标名、路由名 + 手工投递不误伤）与 2 条占位文案用例。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` 4/4 通过
    （console 544 + providers 183 + destinations 31 + 7/31）；`vp run -r build` 通过。
  - 前置：本轮会话工作树的 `node_modules` 不完整，先执行 `vp install --frozen-lockfile`
    才恢复测试能力。

### release-infra lane

`gh auth status` 确认 token 已含 `workflow` scope；main 最近 5 次 CI 全 success，
最近 50 次 46 success / 1 failure / 3 cancelled，唯一失败已由 `517ecd0f` 修复，非 flaky。

- **REL-3（P0，已核实）**：`docker-compose.yml:7,32-37` 固定镜像与全局卷名；
  `scripts/docker-smoke.sh:16-17,29,37` 复用同一 compose 且无条件 `down -v`。
  新证据：`docker-smoke.sh:35-42` 先 `down -v` 再抓日志，失败时日志必丢；
  `:67,83,96` 的 curl 无连接/总超时。
- **REL-6**：`test -f` 无法区分命名卷/匿名卷，`curl -f` 不校验 HTML，无 restart 持久化验证。
- **REL-7**：除已知问题外，Playwright 先启动 webServer 再跑 globalSetup，
  `e2e/global-setup.ts:13-18` 在服务已打开并迁移数据库之后才删库；host 使用 `127.0.0.1`。
- **REL-5**：CI 只 build，`.output/server/index.mjs` 从未在 CI 启动；建议先加
  `scripts/artifact-smoke.sh`（临时目录/DB + 固定 secret + `/api/ready` 断言）。
- **REL-9/REL-10/REL-11**：migration 测试全为 `:memory:`；恢复 runbook 未清理旧
  `-wal/-shm`；`.github/**` 被 fmt/lint 排除且无 actionlint/shellcheck。均仍成立。
- **REL-4**：`alert-flow.spec.ts:27-119` 未创建 Route、未断言 Delivery，测试名却写
  “set up, route, and deliver”。
- **REL-1**：CI 无 e2e job、无 `playwright install`、无失败 artifact 上传；权限已具备。
- **REL-13**：仓库 public 且 `licenseInfo: null`，维持 `blocked-autonomous`。
- **REL-12**：已确认修复（Node `26.12.0` 与 `.node-version` 一致）。

### EXPERT_PANEL

- 本轮无新增 EXPERT_PANEL 事项。REL-13（LICENSE）继续 `blocked-autonomous`，
  决策材料已在 backlog；后续轮次换组重评。
- 安全红线未触碰：无 schema/迁移、无 secret 处理变化、无投递/路由语义变化。

### 下一轮优先项

1. REQ-47（29）：投递详情展示外部消息引用，纯前端。
2. REL-3（28，P0）：Docker smoke 隔离。
3. 补跑 requirements + docs-drift 车道。
4. REQ-48 / REQ-27 / REQ-32 / REQ-22 / REQ-24 / REQ-12 / REQ-13 等既有高价值候选。
5. REL-6 + REL-7 的 harness/断言增强；REL-5 的 artifact smoke。

## 2026-10-18（第 10 轮）

- 时间：2026-10-18 21:26–22:30 CST（13:26–14:30Z）。
- 基线：`origin/main` @ `d465145`（main CI 最近一次 success）。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计仍是第 1 轮（13:30 CST）；
  backlog 有多个 ≥27 分候选且无遗留 open PR，按第 1.5 步优先消化高价值候选。
- 车道轮转位置：本轮跑 `requirements` + `architecture` + `quality`，三条均返回。
  下一轮建议 `docs-drift` + `release-infra`（`requirements` 每轮必跑）。
- 工作树：`agent-iteration` 仅用于并发锁；实现与验证使用会话工作树
  `great-davinci-b285f3`；收尾时删除该工作树的 `node_modules` 与 `agent-iteration`。

### 本轮交付

- PR #128 `feat(console): show delivery timing and full attempt diagnostics`。
  - **REQ-42**：投递详情摘要新增创建/结束时间与排队、发送、端到端耗时；
    attempts 表新增「耗时」列。纯派生自既有 `DeliveryDetail` DTO。
  - **REQ-43**：尝试记录的错误/响应单元格改为可点开对话框，完整展示已脱敏
    `error` / `responseBody`；JSON 响应格式化高亮，错误与响应体均可复制。
  - **Q-9（顺带修复）**：`DeliveryExecution.execute` 增加实时时钟，
    `markSucceeded/markFailed` 持久化真实 `startedAt`；attempt 的起止时间不再等于批次时间，
    退避也以真实完成时间为基准。否则新增耗时列会恒为 `0ms`。
  - 新增中文 mini-PRD `docs/prd/delivery-detail-diagnostics.md`；中英文案同步。
  - 新增/更新测试：耗时格式化 7 条、耗时派生 7 条、详情摘要 2 条、attempts 表 4 条、
    执行器时钟 2 条、store 持久化断言 1 条。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test`
    console 539 tests + providers 183 + destinations 31 全绿；`vp run -r build` 通过。
  - 未做浏览器实测：本机没有运行中的 Tocsin console dev server。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-47（29）**：投递详情展示外部消息引用。DTO 已返回 `providerReference`
  且注明非 secret（`packages/api/src/schemas/operations.ts:115-117`），详情页未渲染；
  纯前端 + 复制。
- **REQ-48（28）**：配置删除影响预检。删除确认只有静态文案
  （`source-actions.tsx:143-146`、`destination-actions.tsx:132-137`、
  `routes-section.tsx:249-252`），而删除会级联清理历史与路由引用；需只读 preview procedure。
- **REQ-49（27）**：可移植配置覆盖抑制规则。`ConfigurationSchema` 只含
  settings/feishuApps/sources/destinations/routes（`packages/core/src/config.ts:85-90`），
  备份/迁移会静默丢失静默窗口。
- **REQ-50（26）**：投递详情内联目标诊断与测试。详情工具栏只有重试/返回
  （`delivery-detail-page.tsx:46-64`），可复用 `destinations.test` 与 `destinationMetadata`。
- **REQ-51（23）**：接入侧拒绝与鉴权失败可观测。`invalid_token`/`source_disabled` 等只写日志
  （`intake.service.ts:64-76,317-327`）；需 forward-only 0004 + 有界遥测 + Sources 列。
- 已确认「补发被抑制投递」仍是 PRD 明确非目标，不立项。

### architecture lane

- 新增 **ARCH-13（22）**：`ConfigPortabilityService` 在 `:99,109` 直接写死 `process.env`，
  options 无 `readEnv`，container 无法注入测试环境；与显式依赖约定不符。
- 新增 **ARCH-14（18）**：`migrate/runner.ts:1` 的 `server-only` 标记冗余；该文件自身不使用
  服务端 API，约束已由上层传递，按 AGENTS 应移除。
- 复核：ARCH-1..12、FIX-5/FIX-9/FIX-10、DOC-6、SEC-3 全部仍成立。
- 已核实清洁：service 无 `ORPCError`/无单例/显式构造、客户端无 server 导入、
  11 个 router 与 contract 名称一致、repository 三件套齐全、container 无请求级数据。

### quality lane

- 复核：Q-5 影响面比原记录更大（损坏 `route_matches_json` 会让 Events 与 Deliveries
  双列表 500，worker claim 与投递详情同样受影响）；Q-7/Q-8/Q-9/Q-10/Q-13 仍成立；
  Q-11 已由 #119 修复。Q-13 的断言实际恒真（驱动错误文本本身不含 secret）。
- 新增 6 条候选：
  - **Q-14（24）**：退避翻倍与上限分支未测（`delivery-execution.ts:219-222`）。
  - **Q-15（24）**：重试/加急按钮完成后未断言恢复可用（`finally` 无守护）。
  - **Q-16（23）**：分页 parity 测试自证（`deliveries-pagination-parity.test.tsx:44-45,64-66`,
    两次渲染同一 helper，EventsTable 从未渲染）。
  - **Q-17（25）**：投递详情页 null / 重试门槛无测试（`delivery-detail-page.tsx:25-35,58`）。
  - **Q-18（22）**：抑制提示降级数据分支未测（`delivery-suppression-notice.tsx:33,36-45`）。
  - **Q-19（24）**：列表页重试/手动 worker 错误路径无测试（`deliveries-page.tsx:75-90`）。
- 次要观察：worker `getHealth()` 失败后保留上一次成功的 `lastRun`，建议明确语义；
  `history.helpers.ts` 的 cursor 编解码已无引用，可随 Q-5 一并清理。

### 本轮未做 / 备注

- 无 EXPERT_PANEL 事项。Q-9 属「修正与契约不一致的行为」，已带回归测试随主 PR 交付。
- 主交付只开一个 PR；收尾另有一条 `docs(planning):` 记录本轮结束时间与工作树清理。
- 工作树已清理：`agent-iteration` 已删除，会话工作树的 `node_modules` 已删除，
  已合并的本地 agent 分支已删除。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 仓库禁止 squash merge，PR 以 rebase 合并。

### 下一轮优先项

1. **REQ-47**（29）：投递详情展示外部消息引用。
2. **REQ-37**（29）：投递搜索覆盖失败原因/目标/路由。
3. **REQ-48**（28）：配置删除影响预检。
4. **REQ-27**（28）：Deliveries 列表告警身份。
5. **REQ-32**（28）：解析失败事件的诊断可见性。
6. **REL-3**（28）：Docker smoke 卷/镜像/项目/端口隔离。
7. 补跑 `docs-drift` + `release-infra` 车道。
8. **Q-14..Q-19 + Q-12/Q-13 + Q-4/Q-5**：合并一个 `test:` PR。

## 2026-10-18（第 9 轮）

- 时间：2026-10-18 20:34–21:15 CST（12:34–13:15Z）。
- 基线：`origin/main` @ `2b6422e`（main CI 最近一次 success）。
- 本轮类型：**需求切片 + 文档修复**（非 full-audit）。最近全量审计仍是第 1 轮（13:30 CST），已超过
  6 小时；但 backlog 有多个 ≥27 分候选且无遗留 open PR，按第 1.5 步优先消化高价值候选。
- 车道轮转位置：本轮跑 `requirements` + `docs-drift` + `architecture`。
  `requirements` 与 `docs-drift` 已返回；`architecture` 超过 30 分钟仍无输出，按记忆中的
  车道限时停止，发现留待下一轮补跑。下一轮建议 `architecture` + `quality`
  （`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `heuristic-elgamal-310055`；收尾时删除该工作树的
  `node_modules` 与 `agent-iteration` 工作树。

### 本轮交付

- PR #126 `feat(console): retry failed deliveries from the detail page`（open，CI green 后 rebase 合并）。
  - 详情页工具栏新增 `DeliveryRetryButton`：仅 `failed` 态渲染，复用
    `operations.retryDelivery`；成功后提示「投递已重新入队」并失效 operations 查询，
    失败时展示服务端可读原因；请求进行中禁用。
  - 非失败状态不渲染，避免用户点击后才收到状态错误（仓储只允许失败态重试，
    `delivery.repository.ts:417-419`）。
  - 新增中文 mini-PRD `docs/prd/delivery-detail-retry.md`；中英文案同步。
  - 新增 4 条组件测试；console 517 tests 全绿；`vp check` 0 errors（11 条既有 warning）；
    `vp run -r build` 通过。
  - 未做浏览器实测：本机 5173 端口属于其他项目，没有运行中的 Tocsin console dev server。
- PR #127 `docs: correct stale architecture, search, and release claims`（open，CI green 后 rebase 合并）。
  - 更正 DOC-13（import boundaries 4 处）、DOC-14（suppressions schema/id 工厂）、
    DOC-12（去重证据拆行）、DOC-19（RC checklist 排障候选状态）、DOC-20（历史预览 PRD
    现状陈述）、DOC-4（next-round 基线与 S0 状态）、REL-12（Node 版本）。
  - `vp fmt --check` 通过；纯文档改动，无行为变更。
  - DOC-6（文件树）与 DOC-11（adapter PRD 状态注记）范围较大，留在 backlog 下一轮。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-42（29）**：告警送达时效剖面。详情摘要与 attempts 表只有原始时间戳，没有排队/
  发送/端到端耗时；DTO 已含 `createdAt/finishedAt`（`operations.ts:107-126`、
  `delivery-summary-tab.tsx:13-66`、`delivery-attempts-table.tsx:29-45`）。纯前端派生。
- **REQ-43（29）**：attempt 响应体/错误全文查看。响应体被截到 120 字并塞进 tooltip
  （`delivery-attempts-table.tsx:56,75-77`、`operation-format.ts:49-56`），而 DTO 已有
  完整且已脱敏的 `error`/`responseBody`（`operations.ts:109-116`）。
- **REQ-44（27）**：未匹配路由事件直接补路由。事件详情只有静默/重放/返回
  （`event-detail-page.tsx:57-71`）；新建路由表单没有初始 rule 入口
  （`route-forms.tsx:50-90`）；明确不追溯 intake 快照。
- **REQ-45（27）**：当前筛选窗口内的投递失败聚合。只有逐行列表；需只读 summary
  procedure + Top N 目标/错误分组（`operations.ts:36-88`、`history.repository.ts:212-290`）。
- **REQ-46（27）**：事件排障摘要一键复制。当前只能复制单个标识符
  （`event-detail-term.tsx:7-44`）；摘要字段均已在页面
  （`event-detail-summary.tsx:11-71`）。

### docs-drift lane

8 处断言过期（前 7 条为已存在的 DOC/REL 项复核）；除 DOC-6/DOC-11 外均已在 #127 更正：

- **DOC-11（高）**：`adapter-contribution-experience.md` 的「不存在」盘点大面积过期：
  contributor guide/scaffold 已存在（`docs/contributing/destination-adapter.md:1`、
  `scripts/new-destination-adapter.mjs:1`、`justfile:71-72`），test-kit 已导出
  （`packages/destinations/src/test-kit/index.ts:1`），registry audit 已消费 `secretFields`
  （`registry.ts:83,103`），`iconName` 已被 console 消费
  （`destination-kind-icon.tsx:26-30`），S0 已改为穷尽 switch（`config-portability.ts:358-370`）。
- **DOC-4（高）**：`next-round.md:3` 基线 `7b5d501` 与工作树路径过期；`:206-221` 仍把 S0
  列为待做第一步，实际已由 `a460a6f` 修复。
- **DOC-13（高）**：import boundaries 文档 4 处与代码不一致：procedure 示例应使用
  `withDashboardService`（`sources/router.ts:5,9-11`）；core operations 路径应为
  `packages/core/src/operations.ts:39`；public probe 使用 `findDashboardContext()`
  （`session/router.ts:26`）；middleware 是 3 个文件而非 4 个。
- **DOC-6（高）**：`application-container.md:56-69` 与 `frontend-architecture.md:37-108`
  文件树仍缺 session/suppressions router、dashboard-context middleware、auth/integrations/
  suppressions feature 与三个 repository。
- **REL-12（中）**：`docker-production-deployment.md:28` 写 Node `26.11.1`，实际
  `.node-version` 为 `26.12.0`。
- **DOC-12（中）**：`route-authoring-current-state.md:120,189` 称去重证据不落库；
  实际 `delivery_dedupe_keys` 已持久化（`schema.ts:164-185`、
  `delivery.repository.ts:95,109`）。`skipExisting` 仍只回传计数，需要拆成两行。
- **DOC-14（中）**：`sqlite-store.md:138-155` 的 schema 列表缺 `suppressions`，
  `:189-198` 的 id 工厂缺 `suppression`（`schema.ts:33`、`store.ts:45`）。
- **DOC-19（新，26）**：`mvp-rc-checklist.md:188` 仍把时间范围、ID 搜索、route explain
  列为下一轮候选，实际均已落地；fingerprint 视图仍未做。
- **DOC-20（新，22）**：`destination-historical-event-preview.md:24` 仍称控制台从未传
  `sampleEventId`，与顶部「已实现」矛盾（PR #122 后遗留）。

### architecture lane

超过 30 分钟仍无输出，按车道限时停止，发现留待下一轮补跑（连续第 3 个未返回的车道）。

### 本轮未做 / 备注

- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。
- 仓库禁止 squash merge，PR 以 rebase 合并。

### 下一轮优先项

1. **REQ-42/REQ-43**（29）：投递详情时效剖面、attempt 响应体全文；同一页面、纯前端。
2. **REQ-37**（29）：投递搜索覆盖失败原因/目标/路由。
3. **REQ-27**（28）：Deliveries 列表告警身份。
4. **REQ-32**（28）：解析失败事件的诊断可见性。
5. **REL-3**（28）：Docker smoke 卷/镜像/项目/端口隔离。
6. **REQ-22/REQ-24/REQ-12/REQ-13**（28）：既有高价值切片。
7. 补跑 `architecture` + `quality` 车道。
8. DOC-4/6/11/12/13/14/19/20 + REL-12：文档批量更正，可合并一个 `docs:` PR。

## 2026-10-18（第 8 轮）

- 时间：2026-10-18 20:04–20:35 CST（12:04–12:35Z）。
- 基线：`origin/main` @ `9981b89`（main CI 最近三次全绿）。
- 本轮类型：**需求切片**（非 full-audit）。backlog 有多个 ≥27 分候选，按第 1.5 步继续；
  最近全量审计仍是第 1 轮，已超过 6 小时，但 backlog 未清空，优先消化高价值候选。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `release-infra`。
  `requirements` 与 `release-infra` 已返回；`quality` 收尾时仍在运行，留待下一轮补记。
  下一轮建议 `architecture` + `docs-drift`（`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `xenodochial-volhard-09db85`。

### 本轮交付

- PR #125 `feat(console): search events and deliveries by identifier`（open，CI green 后合并）。
  - `eventSearchPredicate` 增加 `events.id`，并用 `EXISTS` 子查询匹配所属投递的
    `deliveries.id`；事件列表粘贴投递 ID 可反查来源事件。
  - 新增 `deliverySearchPredicate`：匹配 `deliveries.id`、`events.id` 及原有事件字段，
    投递列表粘贴事件 ID 可拉出整组投递；列表与计数共用同一谓词。
  - 搜索占位文案更新为中英文「标题、消息、指纹或 ID」。
  - 新增中文 mini-PRD `docs/prd/operation-search-identifiers.md`；新增 2 条仓储测试，
    用互不包含的 opaque ID 隔离四条查找分支并断言 `total` 一致。
  - 验证：`vp check` 0 errors（11 条既有 warning）；`vp run -r test` console 513 tests
    及其余 3 个包全绿；`vp run -r build` 通过。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-37（29）**：投递搜索覆盖失败原因/目标/路由。`lastError`、目标名、路由名已在表格
  展示（`deliveries-table.tsx:97-101`）但不可搜（`history.repository.ts:425-435`）。
- **REQ-38（29）**：投递详情页重试闭环。RC checklist `:152` 声称详情可 retry，实际只有列表
  有（`delivery-actions.tsx:20-33`、`delivery-detail-page.tsx:47-56`）。
- **REQ-39（27）**：静默窗口剩余时间与一键续期。列表/详情只显示起止时间
  （`suppressions-section.tsx:247-258`、`suppression-detail-page.tsx:83-92`）。
- **REQ-40（26）**：详情返回保留列表筛选。返回固定跳 `/events`、`/deliveries`
  （`event-detail-page.tsx:63-69`、`delivery-detail-page.tsx:49-55`）。
- **REQ-41（26）**：告警源接入指引。创建提示只有 URL/Token
  （`source-token-notice-panel.tsx:16-79`），provider catalog 无接入步骤/示例；
  Generic 文案还声称支持 JSON 字段映射。

### release-infra lane

REL-1..14 均仍成立；RC checklist 只有 3 条未勾选，全是真缺（E2E workflow、provider
fixtures；Docker smoke 属「形式满足、语义未满足」）。本机 `docker`、`just` 均可用。

- **REL-3/6/7 复核**：显式卷名 + 固定镜像 tag 使 `docker-smoke.sh` 的 `-p tocsin-smoke`
  失效，`down -v` 会删除正常栈数据卷；`test -f` 分不清卷类型；E2E 等静态 `/api/health`
  而非 `/api/ready`，端口/DB 路径固定且未固定 locale。
- **REL-1 最小 CI 方案**（已核实可行，无新服务/secret）：`ci.yml` 增加独立 `e2e` job →
  setup-vp（`.node-version` + cache）→ 安装 node-gyp 依赖 → `vp install --frozen-lockfile`
  → `playwright install --with-deps chromium` → `CI=true playwright test`。
- **REL-9/10/11/12/14** 仍成立；`docker-production-deployment.md:28` 的 Node 版本
  （`26.11.1` vs `.node-version` `26.12.0`）可直接修。
- **REL-13**（LICENSE）保持 `blocked-autonomous`，需专家小组做法律/产品决策。

### 本轮未做 / 备注

- `quality` 车道收尾时仍在运行，未返回；下一轮继续并补记发现。
- 未做浏览器实测：本机没有运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。
- 仓库禁止 squash merge，PR 以 rebase 合并。

### 下一轮优先项

1. REQ-38（29）：投递详情页重试闭环。
2. REQ-37（29）：投递搜索覆盖失败原因/目标/路由。
3. REQ-27（28）：Deliveries 列表告警身份。
4. REQ-32（28）：解析失败事件的诊断可见性。
5. REL-3（28）：Docker smoke 隔离。
6. 补记 quality lane 发现（第 7、8 轮连续未返回）。

## 2026-10-18（第 7 轮）

- 时间：2026-10-18 19:12–20:00 CST（11:12–12:00Z）。
- 基线：`origin/main` @ `0fda95c`；本轮合并后为 `65e6f33`（#122）、`2d73ec6`（#123）。
- 本轮类型：**需求切片 + 文档修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距本轮开始 5 小时 42 分，仍不足 6 小时；backlog 有多个 ≥27 分候选，按第 1.5 步继续。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `docs-drift`（承接第 6 轮建议）。
  `requirements` 与 `docs-drift` 已返回；`quality` 在收尾时仍在运行，发现留待下一轮记录。
  下一轮建议 `release-infra` + `architecture`（`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `exciting-chandrasekhar-f60fca`，收尾时删除其 `node_modules`。

### 本轮交付

- PR #122 `feat(console): preview destinations with a historical event sample`
  （rebase 合并 `65e6f33`）。
  - 预览对话框新增「样例来源」选择器：内置样例 + 最近 20 条历史 Event；选择后按同一份预览
    请求（已保存 Destination / 新增草稿 / 编辑草稿）重放 `sampleEventId`。
  - 对话框展示当前样例来源与接收时间；空态、加载失败与清除后回退内置样例均有提示。
  - 新增 `recentEventsQueryOptions`（复用 `operations.list`，对话框打开时才加载）；
    无服务端 procedure、schema 或持久化变更。
  - 新增中文 mini-PRD `docs/prd/destination-historical-event-preview.md`；中英文案同步。
  - 新增 2 条对话框测试；console 511 tests 全绿；`vp check` 0 errors、`vp run -r build` 通过。
- PR #123 `docs: correct stale auth, template, and release claims`（rebase 合并 `2d73ec6`）。
  - 更正「应用没有内置登录限流」：Better Auth production 默认启用（10s/100，登录 10s/3）。
  - 补 `TOCSIN_DESTINATION_TIMEOUT_MS` 环境变量；RC checklist 顶部与已勾选 smoke gate 对齐。
  - post-MVP、template follow-up、adapter-extensibility 更新为四种模板模式已交付。
  - 更正 destination registry audit 缺失、console `typecheck` 命令、`auth`→`session` 命名空间、
    ADR 0007 命名空间清单。
  - `vp fmt --check` 通过。

### requirements lane

新增 6 条候选（已写入 backlog），本轮最高分 **REQ-31（29）**：

- **REQ-31（29）**：排障搜索覆盖事件/投递 ID。`eventSearchPredicate` 只匹配
  title/message/fingerprint，列表与 total 共用（`history.repository.ts:397-410`）；URL `q` 已存在。
- **REQ-32（28）**：解析失败事件的诊断可见性。审计事件已写 providerMetadata
  （`intake.service.ts:191-239`），但列表、详情、筛选均不可见
  （`event-raw-tab.tsx:13-28`、`EventListItem` 无该字段）。
- **REQ-33（27）**：绝对时间窗口过滤；仓储只有 `since` 没有上界（`history.interface.ts:23-49`）。
- **REQ-34（27）**：筛选结果导出 CSV；只读 export procedure + CSV 注入转义，上限 5000 行。
- **REQ-35（27）**：运维列表自动刷新；全仓无 `refetchInterval`，Deliveries 连手动刷新都没有
  （`deliveries-page-toolbar.tsx:21-46`）。
- **REQ-36（27）**：事件列表标签可见性；`EventListItem` 不含 labels（`history.repository.ts:52-77`）。
- 附带核实：RC checklist 声称 Delivery 详情可 retry，实际只在列表有
  （`delivery-actions.tsx:25-38`、`delivery-detail-page.tsx:48-56`），留作文档/质量项。

### docs-drift lane

10 处断言过期，全部已在 #123 更正：

- HIGH：`docker-production-deployment.md:114` 称没有内置登录限流，实际 Better Auth production
  默认启用（`auth-options.ts:47-52` 未关闭）。
- MEDIUM：RC checklist 顶部仍称缺 compose smoke automation（同文 `:124` 已勾选）。
- MEDIUM：post-MVP 规划仍把模板引擎、抑制、时间范围列为待讨论方向。
- MEDIUM：template follow-up issues 称三种模式未实现；adapter-extensibility 称模板只覆盖 Feishu、
  destinations registry 无 audit。
- MEDIUM：两处 `vp -C apps/console run typecheck` 不存在（console 无该 script）。
- LOW：`auth.getDashboardSession` 应为 `session.*`（frontend-architecture、
  import-boundaries、application-container）；ADR 0007 命名空间清单缺
  `integrations`/`suppressions`；部署文档缺 `TOCSIN_DESTINATION_TIMEOUT_MS`。

### quality lane

本轮结束时该车道仍在运行，未返回结果；不阻塞交付，下一轮继续并补记发现。

### 本轮未做 / 备注

- 未做浏览器实测：本机 5173 端口是另一个 Nuxt 项目，没有运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。
- 仓库禁止 squash merge，两个 PR 均以 rebase 合并。

### 下一轮优先项

1. REQ-31（29）：搜索覆盖事件/投递 ID。
2. REQ-27（28）：Deliveries 列表告警身份。
3. REQ-32（28）：解析失败事件的诊断可见性。
4. REL-3（28）：Docker smoke 卷/镜像/项目/端口隔离。
5. REQ-22/REQ-24/REQ-12/REQ-13（28）：既有高价值切片。
6. REQ-25（27）、REQ-33/34/35/36（27）。
7. 补齐 quality lane 发现并记录。

## 2026-10-18（第 6 轮）

- 时间：2026-10-18 18:16–19:00 CST（10:16–11:00Z）。
- 基线：`origin/main` @ `e4dcab9`；本轮合并后为 `73e0691`（#118）、`ecb8a8e`（#119）。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距本轮开始不足 6 小时；backlog 有多个 ≥27 分候选，按第 1.5 步规则继续。
- 车道轮转位置：本轮跑 `requirements` + `release-infra` + `architecture`。`requirements`
  与 `release-infra` 先返回，`architecture` 在收尾阶段返回；下一轮建议
  `quality` + `docs-drift`（`requirements` 每轮必跑）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`；`agent-iteration` 仅用于并发锁，
  实现与验证使用会话工作树 `compassionate-blackburn-817360`。工作树已清理：
  `agent-iteration` 已删除，会话工作树的 `node_modules` 已删除，本轮三个 agent 分支已删除。

### 本轮交付

- PR #118 `feat(console): surface retention-pruned raw payloads explicitly`
  （rebase 合并 `73e0691`）。
  - `EventDetail` 新增派生字段 `rawPayloadPruned`；`isPrunedRawPayload` 精确匹配
    `{retentionPruned:true}` 哨兵，真实载荷带同名字段不误判。
  - Raw 标签页在已清理时显示「原始数据已按保留策略清理」说明，不再把哨兵当 JSON 渲染。
  - 新增中文 mini-PRD `docs/prd/raw-payload-pruned-state.md`；中英文案同步。
  - 新增 6 条测试；console 507 tests 全绿；`vp check` 0 errors、build 通过。
- PR #119 `test(console): cover resolver failures on the delivery send path`
  （rebase 合并 `ecb8a8e`）。
  - 覆盖 `resolveDestinationConfig` 的 `DomainValidationError`（最终失败、不重试）与
    未知异常（脱敏后记录）两条此前无测试的分支。
  - 新增 2 条测试；console 509 tests 全绿；`vp check` 0 errors、build 通过。

### requirements lane

新增 6 条候选（已写入 backlog），本轮最高分 **REQ-26（29）**：

- **REQ-26（29）**：Destination 用真实历史 Event 预览。服务端 `previewDestination` 已接受
  `sampleEventId` 并能读取历史事件（`destination.service.ts:197-212`），但控制台从未传参
  （`destinations-page.tsx:179-188`）；预览对话框也不显示样例来源。纯前端切片。
- **REQ-27（28）**：Deliveries 列表只显示 source + eventId，不显示告警标题/严重程度/状态，
  而筛选面板允许按 severity/status 过滤（`delivery-event-cell.tsx:1-18`、
  `history.repository.ts:218-237`、`operation-filters.tsx:248-308`）。
- **REQ-25（27）**：抑制规则试跑预览。PRD 承诺 `preview` 与范围预览
  （`alert-suppression.md:97,209,238`），代码只有 list/get/hits；
  `urgent-impact-preview.tsx` 只按 destinationIds 缩小目标，不评估事件。
- 中长期：REQ-28（21，投递历史名称快照，需 forward-only 0004）、REQ-29（24，抑制保留期清理）、
  REQ-30（25，配置页搜索/过滤）。
- 合并建议：REQ-21 扩为 `deliveryOutcome + routeMatch=none|any`；REQ-9/REQ-12/Route 最近活动
  共用 `ConfigurationActivitySummary` DTO。已写入对应 backlog 备注。
- 附带确认：FIX-8（抑制 `createdBy` 永远为空）仍是 REQ-25 的前置项。

### release-infra lane

复核 REL-1..5 仍存在，修正一处旧结论：**当前 token 已有 `workflow` scope**，
REL-1 的阻碍是发布 gate 设计与 spec 覆盖，不是权限。新增发现：

- **N2（升级 REL-3 到 28）**：`docker-compose.yml:7,32-37` 固定镜像 `tocsin:local` 与全局卷名
  `tocsin-data`；`docker-smoke.sh:16-17,29,37` 固定项目名/端口并复用同一 compose 文件。
  正常栈运行时 smoke 会挂载真实 SQLite 卷（双 worker 竞争）并覆盖镜像 tag，
  `down -v` 会删除真实数据卷。应先加 `docker-compose.smoke.yml` override。
- **N1（REL-6，26）**：smoke 断言弱于 checklist：`test -f` 无法区分命名卷与匿名卷；
  `curl -f` 不校验 HTML；没有 restart 持久化验证（`docker-smoke.sh:91-98`）。
- **N3（REL-7，26）**：E2E 等 `/api/health` 而非 `/api/ready`；固定 4173 端口与
  `/tmp/tocsin-e2e.sqlite`；`global-setup.ts:14-21` 重复默认值；未固定 locale。
- **N4（REL-8，23）**：没有任何门禁同时覆盖「生产构建 + 真实操作链路」。
- **N5（REL-9，25）**：migration 测试全部使用 `:memory:`，文件库/WAL/校验和未覆盖。
- **N6（REL-10，25）**：备份恢复 runbook 未删除快照中不存在的旧 `-wal`/`-shm`。
- **N7（REL-11，22）**、**N9（REL-12，24）**、**N10（REL-13，blocked-autonomous）**、
  **N8/N11（REL-14，20）**：workflow 校验、Node 版本文档、LICENSE 缺失、发布卫生项。
- 已核实非问题：CI 权限最小化、Node 版本接线、migration 升级单测、health/ready 语义。

### architecture lane

未发现 HIGH 级一致性缺口；REQ-5/REQ-7/REQ-16 均未破坏分层与导入边界。ARCH-1..9 全部
仍成立，FIX-5、DOC-6 仍成立。新增：

- **NEW-1（ARCH-10，23）**：`destination-form.tsx:82-1292` 单体 1390 行，适配器/模板/预览
  区域全部内联；建议与模板编辑器改造一起拆。
- **NEW-2（ARCH-11，24）**：抑制表单仍是 `useState` + 手写校验
  （`suppression-forms.tsx:193-236`），不符合 AGENTS 的 TanStack Form 约定。
- **NEW-3（FIX-9，24）**：`server/runtime/store.ts` 无生产 importer，唯一引用是自身测试；
  `application-container.md:50` 仍声称它存在。
- **NEW-4**：`OperationFilters` 的 `rail`/`grid` 布局分支只剩测试可达
  （`operation-filters.tsx:58,64-77`），建议并入 FIX-5 删除。
- **NEW-5（ARCH-12，22）**：`hashSourceToken` 定义在 `intake.service.ts`，被 source 与
  config-portability service 直接导入，建议移到窄模块。
- **NEW-6/NEW-7（DOC-13/DOC-14，24/23）**：import boundaries 文档 4 处不一致
  （`auth.getDashboardSession`、`context.dashboardRequest` 示例、namespace 列表、
  `operations.ts` 路径）；sqlite-store 文档缺 `suppressions` 表与 `suppression` id 工厂。
- **NEW-8（FIX-10，20）**：`@faker-js/faker`、`@tanstack/match-sorter-utils` 无 import。
- **NEW-9 / NEW-10（仅记录）**：`route-match-gaps.ts` 领域逻辑放在 repository 目录；
  `features/configuration` 缺 `model/`，`use-settings-workspace.ts` 放在 `ui/`。
- 已核实清洁：service 无 `ORPCError`、无模块级 service 单例、container 无请求级数据、
  entrypoint 薄、contract/implementer 11 个 namespace 同步、repository 三件套齐全、
  包边界与前端边界干净。

### 本轮未做 / 备注

- 未做浏览器实测：本机没有运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项；REL-13（LICENSE）记录为 `blocked-autonomous`，需后续专家小组
  做法律/产品决策。
- 仓库禁止 squash merge，两个 PR 均以 rebase 合并。

### 下一轮优先项

1. REQ-26（29）：Destination 历史 Event 预览（纯前端）。
2. REQ-27（28）：Deliveries 列表告警身份。
3. REL-3（28）：Docker smoke 卷/镜像/项目/端口隔离。
4. REQ-25（27）：抑制规则试跑预览。
5. REL-6 + REL-7（26/26）：smoke 断言与 E2E harness 隔离。
6. Q-12/Q-13/Q-4/Q-5：纯测试补齐。
7. FIX-8（26）、DOC-4/6/11/12/13/14 + REL-12。
8. 低风险 chore：FIX-5 + FIX-9 + NEW-4 + FIX-10（删除死代码/死分支/未用依赖）。
9. REL-1/REL-4 在扩 spec 后再接 CI；ARCH-10/ARCH-11 等再次触碰对应文件时做。

## 2026-10-18（第 5 轮）

- 时间：2026-10-18 17:25–18:05 CST（09:25–10:05Z）。
- 基线：`origin/main` @ `3e62eb7`；本轮合并后为 `a563ff7`（#116），#117 待合并。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距今 < 6 小时；backlog 有 ≥27 分候选，按第 1.5 步规则继续。
- 车道轮转位置：本轮跑 `requirements` + `quality`（拆窄后首次返回）+ `docs-drift`。
  下一轮建议 `release-infra` + `architecture`（`quality` 已覆盖，按 6 小时窗口轮转）。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`，实现使用会话工作树
  `practical-shannon-179ae9`；`agent-iteration` 的并发锁已获取，收尾时删除。

### 本轮交付

- PR #116 `feat(console): silence an event fingerprint from its detail page`
  （rebase 合并 `a563ff7`）。
  - 事件详情工具栏新增「静默此指纹」，打开复用 `CreateSuppressionForm` 的对话框，
    预填当前告警源 + 指纹 + 两小时窗口；告警源/目标按需加载，失败有可读提示。
  - 新增纯函数 `suppressionDefaultsFromEvent` 与 `CreateSuppressionForm.defaultValues`。
  - 新增中文 mini-PRD `docs/prd/event-fingerprint-silence.md`；中英文案同步。
  - 新增 2 条测试；console 501 tests 全绿；`vp check` 0 errors、build 通过。
- PR #117 `docs: correct migration, suppression, and release status claims`（待合并）。
  - 更正 DOC-1/2/3/5/7/8/9/10：抑制已实现、migration 为 0001–0003、E2E/smoke 脚本存在但未接
    CI、route explain 已实现、4 处仓库链接、pnpm 版本。
  - 同步修正 `AGENTS.md` 的 migration 契约与不存在的 `migrate.ts` 入口。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-20（27）**：配置导入预检与变更摘要；导入实际是 upsert，UI 文案却称“替换”
  （`config-portability.service.ts:140-245`、`portable-config-form.tsx:47-54`）。
- **REQ-21（27）**：Events 按投递结果筛选（无投递/失败/被抑制）；事件列表已 join deliveries
  统计（`history.repository.ts:47-77`），但查询契约无此维度。
- **REQ-22（28）**：补投预览目标级明细与执行范围一致；Event 预览已有 `targets` 未渲染，
  Route 预览只显示前 10 条却执行全部（`event-replay-action.tsx:153-175`、
  `route-replay-prompt.tsx:161-162`）。
- **REQ-23（28）**：Raw payload 保留策略清理的显式状态；哨兵 `{retentionPruned:true}` 被当普通
  JSON 展示（`intake.helpers.ts:23-25`、`event-raw-tab.tsx:10-17`）。
- **REQ-24（28）**：抑制窗口影响面汇总；详情页只有 `hits.total`，无事件/目标/最近命中汇总
  （`suppression-detail-page.tsx:35-43`、`suppressions.ts:24-30`）。

### quality lane（拆窄后返回）

6 条新发现（Q-8–Q-13，已写入 backlog），并修正 Q-4 为 6 个 NOT_FOUND 分支：

- **Q-8（26）**：`markSucceeded` 抛错被当成发送失败并重试，可能重复发送/重复 page
  （`delivery-execution.ts:72,93-102,142-159`）。
- **Q-9（24）**：同批 attempt 共用 run 开始时间，`finishedAt == startedAt`，退避可能已过期
  （`delivery-worker.service.ts:48,76,79`）。
- **Q-10（24）**：claim 后单条 execute 抛错会中断整批，剩余投递滞留 `running`
  （`delivery-worker.service.ts:55-77,85-93`）。
- **Q-11/Q-12/Q-13（24/24/20）**：resolver 错误分支、destination test 失败脱敏、worker
  脱敏测试注入不足；均为 AUTO_FIX 补测试候选。

### docs-drift lane

- DOC-1/2/3/5/7/8/9/10 复核为已过期并已在本轮 #117 更正。
- DOC-6 部分完成（`sqlite-store.md` 迁移与仓库树）；`application-container.md`、
  `frontend-architecture.md` 的文件树仍待改。
- 新增 **DOC-11（24）**（`adapter-contribution-experience.md` 的“不存在”盘点部分过期）与
  **DOC-12（23）**（`route-authoring-current-state.md` 去重证据断言过期）。

### 本轮未做

- 未做浏览器实测：本机只有无关的 5173 监听，没有 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。
- 无 EXPERT_PANEL 事项。

### 下一轮优先项

1. REQ-23（28）：Raw payload 保留策略清理状态。
2. REQ-22（28）：补投预览目标级明细与执行范围一致。
3. REQ-24 / REQ-12 / REQ-13（28）：三选一的新 summary/service 切片。
4. REQ-8（28）：Deliveries 按最后活动过滤/排序。
5. Q-11/Q-12/Q-13 + Q-4/Q-5：合并一个 `test:` PR。
6. DOC-4/DOC-6/DOC-11/DOC-12：剩余文档漂移。
7. REL-3（27）：Docker smoke 卷隔离。

## 2026-10-18（第 4 轮）

- 时间：2026-10-18 15:54–17:20 CST（07:54–09:20Z）。
- 基线：`origin/main` @ `364270b`；本轮合并后为 `6002c9f`（#113）、`f21ccb6`（#114）。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）。最近全量审计为第 1 轮（13:30 CST），
  距今 < 6 小时；backlog 有 ≥27 分候选，按第 1.5 步规则继续，不重跑全量审计。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `release-infra`。`requirements`、
  `release-infra` 已返回；`quality` 超时未返回（连续第 2 轮），下一轮补跑或拆小任务。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`，改用会话工作树
  `elated-franklin-f012b3`；`agent-iteration` 的并发锁已获取，收尾时删除工作树与锁。

### 本轮交付

- PR #113 `feat(console): scope operation filters and add route filtering`
  （rebase 合并 `6002c9f`）。
  - `OperationFilters` 新增 `scope`：Events 只渲染搜索、告警源、严重程度、状态、时间范围；
    Deliveries 额外渲染目标、路由、投递状态。修复 Events 页两个静默 no-op。
  - Deliveries 新增 URL `routeId`，贯穿 contract → service → repository 的列表与计数谓词；
    路由下拉复用 `routesQueryOptions()`，保留停用路由以便查历史投递。
  - 新增中文 mini-PRD `docs/prd/operation-filter-scope.md`；中英文文案同步。
  - 新增 7 条测试；console 498 tests 全绿；`vp check` 0 errors、build 通过。
- PR #114 `fix(console): reject redacted placeholders when importing configuration`
  （rebase 合并 `f21ccb6`）。
  - 导入在 feishu appSecret、source/destination `secret_refs` 环境值、kind-owned secret 路径、
    source 顶层敏感键四个位置拒绝字面量 `[REDACTED]`；抛错回滚事务。
  - 新增集成测试覆盖四类位置并断言 sources/destinations/feishu apps/settings 均未被修改；
    console 499 tests 全绿。

### requirements lane

新增 4 条候选（已写入 backlog）：

- **REQ-16（28）**：Event 详情一键按 fingerprint 静默；纯前端切片，复用抑制表单预填与
  claim-time 抑制校验（`event-detail-page.tsx:49-59`、`suppression-forms.tsx:67-100`）。
- **REQ-17（27）**：加急呼叫失败的全局可观测与再呼叫；投递成功但电话全失败时没有任何信号
  （`oncall-execution.ts:136-159`、`delivery-execution.ts:104-118`）。
- **REQ-18（27）**：按当前失败筛选批量重试投递；复用 `retryNow` 语义
  （`delivery.repository.ts:411-440`），需确认框与硬上限。
- **REQ-19（26）**：Events/Deliveries 按标签键值过滤；`json_each(labels_json)` 精确匹配，
  建议 REQ-5 合入后再做（同文件）。
- 附带 **FIX-8（26）**：抑制 `createdBy` 永远为空（`suppression.service.ts:53-71`）。

### release-infra lane

- **REL-3 升级到 27**：`docker-compose.yml:32-37` 显式全局卷名，配合
  `docker-smoke.sh:16,36-37` 的 `down -v`，会删除正常部署的 `tocsin-data` 卷；
  应在任何 Docker smoke 接入 CI 之前修复。
- **REL-1 证据补全**：`ci.yml:16-51` 无 e2e job；`vite.config.ts:51` 排除 `e2e/**`；
  全仓无 `playwright install`；`playwright.config.ts:7-9` 注释误称已有 workflow。
- 新增 **REL-4（25）**：E2E spec 只覆盖 setup/source/destination/webhook/events，
  未创建 Route、未验证 Delivery/retry/filter/重启/导出（`alert-flow.spec.ts:27`）。
- 新增 **REL-5（24）**：build 产物启动与文件型 SQLite migration 无 CI smoke。
- 新增 **DOC-9（27）**：发布文档声称没有 E2E/smoke、迁移只有 0001，与代码不符。
- **REL-2 规模量化**：6 个 adapter 测试文件、19 个内联 payload、31 个用例。

### 本轮未做

- `quality` 车道超时未返回（连续第 2 轮）。
- 未做浏览器实测：本机无运行中的 Tocsin console dev server。
- Obsidian 同步跳过：本会话没有 `obsidian-vault` skill。

### 下一轮优先项

1. REQ-16（28）：Event 详情一键静默。
2. REQ-8（28）：Deliveries 按最后活动过滤/排序。
3. REQ-12 / REQ-13（28）：Destination 最近投递健康或 Source 接入自检。
4. REL-3（27）：Docker smoke 卷隔离（需本地 Docker 实测）。
5. DOC-9 + DOC-1..5/10：发布与架构文档批量更正。
6. 补跑 quality lane（拆小任务避免再次超时）。

## 2026-10-18（第 3 轮）

- 时间：2026-10-18 14:52–16:00 CST（06:52–08:00Z）。
- 基线：`origin/main` @ `4abcfe7`；本轮合并后为 `1458a7a`。
- 本轮类型：**需求切片 + 小修复**（非 full-audit）；最近全量审计为第 1 轮（13:30 CST），
  但 backlog 有 ≥27 分候选，按第 1.5 步规则继续。
- 车道轮转位置：本轮跑 `requirements` + `quality` + `architecture`。`requirements` 与
  `architecture` 已返回；`quality` 超时未返回，下一轮补跑 `quality` → `release-infra` →
  `docs-drift` → `security-exposure`。
- 工作树：写入隔离仍禁止本会话修改 `agent-iteration`，改用会话工作树
  `great-darwin-b34359`；`agent-iteration` 的并发锁已获取，结束前删除。

### 本轮交付

- PR #110 `fix(console): honor fingerprint search and escape LIKE wildcards`
  （rebase 合并 `dcfced9`）。
  - 搜索谓词统一覆盖 `title` / `message` / `fingerprint`，四处列表/计数共用；
    `%`、`_`、`\` 转义并 `ESCAPE '\'`。
  - 新增 `search.test.ts`（5 条），验证指纹命中、`%`/`_` 字面量与 total 一致性。
- PR #111 `feat(console): warn when disabled targets hold deliveries`
  （rebase 合并 `1458a7a`）。
  - 新增 `DeliveryRetentionNotice`：pending 投递在目标/路由停用时说明滞留原因并给出配置页链接。
  - 路由列表通知目标列显示「N 个目标已停用」徽标。
  - 新增中文 mini-PRD `docs/prd/delivery-retention-notice.md`；中英文文案同步。
- 验证：两个 PR 均通过 `vp check`（0 errors）、`vp run -r test`（console 491 tests）、
  `vp run -r build`，CI green 后合并。

### requirements lane

新增 4 条候选（已写入 backlog）：

- **REQ-12（28）**：Destination 列表最近投递健康；`DestinationListItemSchema:64-66` 无健康字段，
  `destinations-section.tsx:56-104` 无投递结果列；AGENTS.md 要求先有 server-side summary DTO。
- **REQ-13（28）**：告警源接入自检 dry-run；所有 provider manifest 声明 `testPayload: true`
  （`packages/providers/src/types.ts:62`）但无消费者，Sources 只有编辑/轮换/启停/删除
  （`source-actions.tsx:21-163`）。
- **REQ-14（27）**：Raw/debug JSON 搜索与折叠；`event-json-block.tsx:14-47` 与
  `delivery-json-block.tsx:14-47` 仅渲染 + 复制；post-MVP 方向 4 `:133` 已列入。
- **REQ-15（26）**：存储容量与历史增长信号；Settings 只有 locale/timeZone/retention
  （`packages/api/src/schemas/settings.ts:5-9`），无行数/体积；`history-retention-and-snapshots.md:22,90` 列为未做。

### architecture lane

新增 5 条候选：

- **ARCH-5（24）**：service 直接构造并抛 `RecordNotFoundError`
  （`destination.service.ts:35,138,158,202,250,374`、`oncall.service.ts:7,59,73`），
  仓库已有 `requireDestination`（`destination.helpers.ts:224`）。
- **ARCH-6（24）**：`/api/ready` 直接访问 SQLite store（`routes/api/ready.ts:10,19,22,26`），
  入口过厚，缺 readiness service。
- **ARCH-7（23）**：`routes-section.tsx`、`suppressions-section.tsx` 内联多个 cell/actions/empty state。
- **ARCH-8（22）**：public i18n router 内联 cookie/header locale 解析
  （`server/orpc/features/i18n/router.ts:13-25`）。
- **ARCH-9（23）**：`locale-cookie.ts:29-35,37-47` 直接使用 `document`/`navigator`，
  无 client-only 标记且被 server router 导入。
- 其余契约项（容器装配、无 service 单例、无 DI、`withDashboardService`、core 环境中性、
  route loader 边界、`vp` 工具链）均 clean。

### 本轮未做

- `quality` 车道超时未返回；未发现需要 EXPERT_PANEL 的新事项。
- 浏览器验证：本机无运行中的 Tocsin console dev server（5173 属于其他项目），未做浏览器实测。

### 下一轮优先项

1. REQ-8 或 REQ-5（28）：Deliveries 按最后活动过滤/排序，或按路由过滤 + 筛选面板按页面能力渲染。
2. REQ-12 或 REQ-13（28）：Destination 最近投递健康，或 Source 接入自检 dry-run。
3. FIX-6（27）：导入配置拒绝字面量 `[REDACTED]`。
4. DOC-1/2/3/4/5：一批高价值文档更正，可合并为一个 `docs:` PR。
5. REL-1（24）：交 EXPERT_PANEL 裁决 E2E / Docker smoke 接入 CI。
6. 补跑 quality lane。

## 2026-10-18（第 2 轮）

- 时间：2026-10-18 14:30–14:40 CST（06:30–06:40Z）。
- 基线：`origin/main` @ `6ea9ec1`；本轮合并后为 `411846e`。
- 工作树：`/Users/chuanhu9/devs/tocsin/.claude/worktrees/cranky-bell-ed610f`。
- 本轮类型：**escalated-fix + requirements**（非 full-audit）。
- 最近全量审计：2026-10-18 第 1 轮（约 13:30 CST）；下次全量审计最早在 19:30 CST 之后。
- 车道轮转位置：本轮已跑 `requirements`；下轮从 `quality` → `architecture` 继续，之后
  `release-infra` → `docs-drift` → `security-exposure`。
- 并发锁：未使用。routine 指定的 `agent-iteration` 工作树被本会话写入隔离拦截，
  改用会话独占工作树 `cranky-bell-ed610f`；下一轮仍应在可用工作树内先检查/创建锁。

### EXPERT_PANEL：SEC-1

- 三位专家（安全与可靠性 / 产品与运维 / 独立评估者）独立评审后一致同意实施。
- 最终选择：`isSensitiveKey` 归一化键名 + 精确集合 + 凭据词尾规则；`redactText`
  的正则由同一规则程序化生成，支持带引号 JSON；保留 `tokenCount` / `maxTokens` /
  `privateKeyId` 可见。
- 决策记录：`docs/planning/decisions/secret-redaction-coverage.md`。
- 附带发现：FastGPT 探测错误在逐键脱敏后仍会暴露上游 code/message，改为原始错误
  呈凭据形状时整体隐藏（`packages/providers/src/fastgpt/parse.ts`）。
- 证据：`packages/core/src/redaction.ts:5-8`、`config-portability.ts:302-326`、
  `configuration.integration.test.ts:29-89`。

### EXPERT_PANEL：Q-1

- 三位专家一致同意实施。
- 最终选择：共享层 `createTimeoutFetch`（10s 默认，传 signal + race deadline，
  覆盖响应体），`DestinationErrorKind` 产生 `timeout` + `retryable`；环境变量
  `TOCSIN_DESTINATION_TIMEOUT_MS`（1–30000ms）注入 worker、destination test 与
  Feishu app 测试。
- 取舍：上限取 30s（产品/运维专家）而非 60s（安全专家），保守且低于 5 分钟 stale 窗口。
- 决策记录：`docs/planning/decisions/outbound-http-timeout.md`。
- 证据：`packages/destinations/src/utils.ts:75-82`、`types.ts:51-57`、
  `delivery-worker.service.ts:40,75-77`。

### requirements lane

新增 5 条候选（已写入 backlog）：

- **REQ-7（29）**：停用目标造成投递静默滞留。`claimNext` 跳过停用目标/路由
  （`delivery.repository.ts:219-226`），但 enqueue 不检查（`:97-168`）；投递 DTO 已有
  `destination.enabled` / `route.enabled`（`packages/core/src/operations.ts:110-121`），
  UI 未展示（`delivery-summary-tab.tsx:14-65`；`routes-section.tsx:319-338`）。
- **REQ-8（28）**：Deliveries 按 `created_at` 排序/过滤（`history.repository.ts:240,269-271`），
  表格却展示 `updated_at`（`deliveries-table.tsx:106-108`），重试后的旧投递会从时间窗口消失。
- **REQ-9（27）**：告警源缺少「最近接收时间」，无法区分上游安静与 Webhook 失效
  （`packages/core/src/source/source.ts:13-18`；`sources-section.tsx:38-77`）。
- **REQ-10（27）**：Event/Delivery 详情互链缺失，三处入口都是纯文本
  （`delivery-summary-tab.tsx:30-43`；`event-detail-deliveries-table.tsx:52-77`；
  `delivery-event-cell.tsx:9-17`）。
- **REQ-11（25）**：Worker/队列健康只有手动运行响应可见（`packages/api/src/contract/operations.ts:84-87`），
  RC checklist `:160` 声称已有 health/last-run，但后台 runner 状态不可见。

附带发现：`next-round.md` 的 A/B/D2/D3/F3/F4/F7 切片已在当前代码落地，续做 DOC-4 时一并更新；
`zh-Hans.json:545` 的「来源」与 AGENTS.md「告警源」不一致（FIX-7）；RC 剩余 gate 主要是
E2E（REL-1）、provider fixtures（REL-2）与备份恢复演练。

### 本轮交付

- PR #107 `fix(core): widen secret redaction coverage`（rebase 合并 `03caa9b`）。
  - 验证：`vp check` 0 errors；`vp run -r test` 全绿；`vp run -r build` 通过。
- PR #108 `fix(destinations): bound outbound requests with a deadline`（rebase 合并 `411846e`）。
  - 验证：`vp check` 0 errors；`vp run -r test` 全绿；`vp run -r build` 通过。

### 下一轮优先项

1. FIX-2 + FIX-3：搜索覆盖 fingerprint，并转义 LIKE 通配符。
2. REQ-5：Deliveries 按路由过滤 + 筛选面板按页面能力渲染。
3. DOC-1/2/3/4/5：一批高价值文档更正。
4. FIX-6：导入配置拒绝字面量 `[REDACTED]`。
5. REL-1：下一轮交 EXPERT_PANEL 裁决 E2E / Docker smoke 接入 CI。

## 2026-10-18（第 1 轮）

- 基线：`origin/main` @ `db54860`（本轮开始时为 `2c10265`，期间主分支合入依赖升级）。
- 工作树：`/Users/chuanhu9/devs/tocsin/.claude/worktrees/agent-iteration`。
- 并发锁：已获取并在结束时删除。

### 专家发现

**requirements（需求发现）**

- REQ-1 时间范围过滤：搜索 schema / contract / 仓储均无时间字段
  （`operation-search.ts:7-25`、`packages/api/src/schemas/operations.ts:190-202`、
  `history.interface.ts:23-43`）；方向见 `docs/prd/post-mvp-planning.md:124-135`。评分 29。
- REQ-5 Deliveries 按路由过滤：`listDeliveries` 已 join `routes` 并投影 `route_name`
  （`history.repository.ts:218-232`），但筛选面板无路由条件。评分 28。
- REQ-2/3/4/6 见 backlog。

**docs-drift（文档漂移）**

- 23 处断言过期，最高优先级：
  - `docs/release/mvp-rc-checklist.md:55-56` 称抑制「没有 service、oRPC、页面」，实际全栈已存在
    （`server/suppressions/suppression.service.ts`、`server/orpc/features/suppressions/router.ts`、
    `features/suppressions/ui/`、`routes/_dashboard.suppressions*.tsx`）。
  - `docs/adr/0010-...:79`、`docs/release/mvp-rc-checklist.md:87`、
    `docs/prd/destination-template-engine.md:72`、`docs/prd/destination-template-follow-up-review.md:118`
    仍指向 `xqvvu/vane`，实际仓库为 `xqvvu/tocsin`。
  - 模板表单限制、`next-round.md` 基线、迁移计划、架构文件树、抑制 PRD 状态均过期。
  - 已核实 `config-portability.ts:311-325` 的穷尽 switch 与参数化脱敏测试已存在（`a460a6f`），
    `next-round.md` §1.1 的结论不再成立。

**security-exposure（安全与数据暴露）**

- 已关闭：destination kind 穷尽 switch 及其参数化测试存在
  （`config-portability.ts:311-325`、`configuration.integration.test.ts:1173-1211`）。
- MEDIUM（ESCALATE）：`isSensitiveKey` 漏掉 `appSecret`/`clientSecret`/`apiSecret`/`privateKey`/
  `X-Auth-Token`（`packages/core/src/redaction.ts:3-9`），source config 与 destination header
  可能明文导出。
- 无真实 secret 进入 oRPC DTO；import protection 标记无违规；日志脱敏已接线并有测试。

**release-infra（发布基建）**

- E2E 脚本与 Docker smoke 已存在，但 CI 未接入；`ESCALATE(需 workflow scope)`。
- E2E spec 覆盖面小于 RC checklist A 的要求（未创建 Route、未验证 Delivery/retry）。
- provider 无 fixture 目录，payload 仍内联于六个 `index.test.ts`。
- `scripts/docker-smoke.sh` 使用全局卷名，`down -v` 会删除正常数据卷。

**architecture（架构一致性）**

- service 纯度、容器装配、repository 拆分、feature 边界、`components/common` 纯度、import 约定、
  i18n 约定、adapter 形状均 clean。
- 大文件：`route-forms.tsx` 965 行、`suppression-forms.tsx` 699 行各含两个导出组件；
  `delivery-state-badge.tsx` 三个导出组件。
- `system-information.ts` 五层相对路径导入根 `package.json`。

**quality（质量与回归）**

- HIGH（ESCALATE）：出站 HTTP 无超时（`packages/destinations/src/utils.ts:42-57` 等），
  单个挂起目标会卡住单进程 worker；改变投递失败语义，需人工拍板。
- MEDIUM：删除不存在的 Source/Destination/Route 返回成功而非 NOT_FOUND
  （`source.service.ts:76-85`、`destination.service.ts:120-129`、`route.service.ts:61-67`）。
- MEDIUM：搜索未转义 LIKE 通配符（`history.repository.ts:95-101` 等）。
- MEDIUM：history repository 查询覆盖薄；destination service NOT_FOUND 分支缺测试。
- LOW：出站响应体无上限；provider `*Result` 对非对象 payload 抛错；若干前端模块无测试。

### 本轮交付

- PR #104 `feat(console): add time range filters to events and deliveries`
  - 新增 URL `range`（15m/1h/6h/24h/7d），Events 按 `received_at`、Deliveries 按 `created_at`，
    列表与 `total` 同谓词；服务端解析相对窗口，时钟可注入。
  - 新增 `docs/prd/operations-time-range.md`。
  - 验证：`vp check`、`vp run -r test`（477 tests）、`vp run -r build`；
    浏览器实测请求体 `{"limit":20,"eventPage":1,"range":"1h"}`，服务端 200。
- PR #105 `test(console): pin the virtualizer viewport in the time zone test`
  - 依赖升级后 `@tanstack/react-virtual` 改用 `clientHeight` 测量，jsdom 默认 0 导致虚拟列表不渲染。
  - 仅测试改动；修复后 main 恢复绿灯。

### 上报事项

- `SEC-1`：扩展 `isSensitiveKey` denylist（secret 处理，需人工拍板）。
- `Q-1`：为出站 HTTP 增加超时与失败分类（改变投递语义，需人工拍板）。
- `REL-1`：把 E2E / Docker smoke 接入 CI（当前 token 缺 `workflow` scope，无法推送 workflow 改动）。

### 下一轮优先项

1. FIX-2 + FIX-3：搜索覆盖 fingerprint，并转义 LIKE 通配符。
2. REQ-5：Deliveries 按路由过滤 + 筛选面板按页面能力渲染。
3. DOC-1/2/3/4/5：一批高价值文档更正。
4. 复核 `docs/planning/next-round.md` 的过期基线后再决定是否续做其中的切片。
