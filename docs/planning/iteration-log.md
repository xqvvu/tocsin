# 自主迭代日志

按轮次倒序追加。每条记录：时间、基线、专家发现、本轮交付、上报事项、下一轮优先项。

## 2026-10-18（第 9 轮）

- 时间：2026-10-18 20:34–21:15 CST（12:34–13:15Z）。
- 基线：`origin/main` @ `2b6422e`（main CI 最近一次 success）。
- 本轮类型：**需求切片**（非 full-audit）。最近全量审计仍是第 1 轮（13:30 CST），已超过
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

8 处断言过期（均写入 backlog，前 7 条为已存在的 DOC/REL 项复核）：

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
