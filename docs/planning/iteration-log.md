# 自主迭代日志

按轮次倒序追加。每条记录：时间、基线、专家发现、本轮交付、上报事项、下一轮优先项。

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
