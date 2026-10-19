# 自主迭代 Backlog

本文件是自主迭代 routine 的跨轮次候选需求与状态记忆。每轮开始时先在这里找
`planned` / `in-progress` 项续做，不要重新发明同一批需求。

状态取值：`candidate` / `planned` / `in-progress` / `shipped` / `blocked-autonomous`。
旧的 `escalated` 不再等待人工：每轮由 EXPERT_PANEL 自主裁决并推进，或转为
`blocked-autonomous` 并留下决策记录。

评分口径（每项 1–5，总分 30）：文档一致性、运维价值、垂直可发布、可逆性、可测试性、成本。
`≥ 27` 视为达到本轮实现门槛；`成本` 分越高表示越省。

## 候选与状态

| id | 标题 | 来源 | 评分 | 状态 | PR | 备注 |
|---|---|---|---|---|---|---|
| REQ-1 | Events/Deliveries 相对时间范围过滤 | post-MVP 方向 4 | 29 | shipped | #104 | `range=15m/1h/6h/24h/7d`；Events 按 `received_at`，Deliveries 按 `created_at`；服务端解析相对窗口 |
| FIX-1 | 时区虚拟列表测试在依赖升级后失败 | main CI | — | shipped | #105 | virtual-core 3.19 改用 `clientHeight` 测量；测试补 mock，仅测试改动 |
| REQ-5 | Deliveries 按路由过滤 + 筛选面板按页面能力渲染 | post-MVP 方向 4 | 28 | shipped | #113 | 同时修掉 Events 页 destination/delivery-state 静默 no-op；PRD `docs/prd/operation-filter-scope.md` |
| REQ-2 | Suppression 列表按派生状态筛选与搜索 | 运维摩擦 | 27 | candidate | — | 纯客户端过滤，复用 `suppressionStateAt` |
| REQ-3 | Route 样例 Event 干跑预览 | post-MVP 方向 2 | 27 | candidate | — | 必须复用 core matcher；不写 events/deliveries |
| REQ-6 | Fingerprint 聚合排障视图 | post-MVP 方向 4 | 27 | candidate | — | 只读聚合 + 精确下钻；注意 GROUP BY 成本 |
| REQ-4 | 过滤态空状态与一键重置 | 运维摩擦 | 26 | candidate | — | 区分「无数据」与「筛选无匹配」 |
| REQ-20 | 配置导入预检与变更摘要 | requirements lane | 27 | candidate | — | 只读 preview procedure + 导入前 create/update/unchanged 摘要；`config-portability.service.ts:140-245` |
| REQ-21 | Events 按投递结果筛选（无投递/失败/被抑制） | requirements lane | 27 | candidate | — | URL `deliveryOutcome`；EXISTS/NOT EXISTS；`history.repository.ts:47-77` 已有统计。建议扩为 `deliveryOutcome + routeMatch=none\|any`，否则「未命中任何路由」的静默丢失仍无法发现 |
| REQ-22 | 补投预览目标级明细与执行范围一致 | requirements lane | 28 | candidate | — | Event 预览已有 `targets` 未渲染；Route 预览只显示前 10 条却执行全部（`route-replay-prompt.tsx:161-162`） |
| REQ-23 | Raw payload 保留策略清理的显式状态 | requirements lane | 28 | shipped | #118 | `EventDetail.rawPayloadPruned` 派生字段 + Raw 标签页清理说明；PRD `docs/prd/raw-payload-pruned-state.md` |
| REQ-24 | 抑制窗口汇总（影响面复盘） | requirements lane | 28 | candidate | — | 新增只读 summary procedure；`suppression-detail-page.tsx:35-43` 只有 hits.total |
| REQ-7 | 停用目标造成投递静默滞留 | requirements lane | 29 | shipped | #111 | 投递详情滞留警示 + 路由列表停用目标徽标；`DeliveryRetentionNotice`；PRD `docs/prd/delivery-retention-notice.md` |
| REQ-8 | Deliveries 按最后活动过滤与排序 | requirements lane | 28 | candidate | — | 列表按 `created_at`（`history.repository.ts:240,269-271`），表格展示 `updated_at` |
| REQ-9 | 告警源最近接收时间 | requirements lane | 27 | candidate | — | `SourceSummary` 无时间字段；聚合 `MAX(events.received_at)`。建议与 REQ-12、Route 最近活动共用 `ConfigurationActivitySummary` DTO，避免三个并行 endpoint |
| REQ-10 | Event/Delivery 详情互链 | requirements lane | 27 | candidate | — | 三个入口目前是纯文本：投递详情、事件投递表、投递列表事件列 |
| REQ-11 | Worker/队列健康只读投影 | requirements lane | 25 | candidate | — | health 仅出现在手动 `runDeliveryWorker` 响应；RC checklist `:160` 声称已有 |
| REQ-12 | Destination 列表最近投递健康 | requirements lane | 28 | candidate | — | 需新 summary DTO；`destination.ts:64-66`、`destinations-section.tsx:56-104`；AGENTS.md 要求先有 DTO |
| REQ-13 | 告警源接入自检 dry-run | requirements lane | 28 | candidate | — | provider manifest `testPayload` 是能力位而非样例 payload，且无消费者；`source-actions.tsx:21-163`、`packages/api/src/contract/sources.ts:24-45`、`packages/providers/src/types.ts:60-65` |
| REQ-14 | Raw/debug JSON 搜索与折叠 | requirements lane | 27 | candidate | — | `event-json-block.tsx:14-47`、`delivery-json-block.tsx:14-47`；post-MVP 方向 4 `:133` |
| REQ-15 | 存储容量与历史增长信号 | requirements lane | 26 | candidate | — | 只读 PRAGMA/COUNT；`settings.ts:5-9`、`operational-summary.tsx:30-58` |
| REQ-16 | Event 详情一键按 fingerprint 静默 | requirements lane | 28 | shipped | #116 | 工具栏「静默此指纹」对话框；复用创建表单预填 source+fingerprint；PRD `docs/prd/event-fingerprint-silence.md` |
| REQ-17 | 加急呼叫失败的全局可观测与再呼叫 | requirements lane | 27 | candidate | — | 投递成功但电话全失败时无信号；`oncall-execution.ts:136-159`、`delivery-execution.ts:104-118`；需只读投影 |
| REQ-18 | 按当前失败筛选批量重试投递 | requirements lane | 27 | candidate | — | 复用 `retryNow` 语义；需确认框 + 硬上限 200；`delivery.repository.ts:411-440` |
| REQ-19 | Events/Deliveries 按标签键值过滤 | requirements lane | 26 | candidate | — | `json_each(labels_json)` 精确匹配；建议 REQ-5 合入后再做（同文件） |
| FIX-2 | 搜索框承诺指纹但只搜 title/message | 代码核实 | 29 | shipped | #110 | 与 FIX-3 同一 PR；统一 `title/message/fingerprint` 谓词，列表与 total 共用 |
| FIX-3 | 搜索未转义 LIKE 通配符 | 质量 lane | 27 | shipped | #110 | 转义 `%` `_` `\` 并使用 `ESCAPE '\'`；新增 `search.test.ts` |
| FIX-4 | 删除不存在的 Source/Destination/Route 返回成功 | 质量 lane | 20 | candidate | — | 第 23 轮复核**已过期**：仓储 delete 均先 `requireSource`/`requireDestination`/`requireRoute`（`source.repository.ts:112-115`、`destination.repository.ts:101-104`、`route.repository.ts:166-169`），事务向上抛 `RecordNotFoundError`。剩余工作仅为补三条回归测试 |
| FIX-5 | `operations-panel.tsx`/`detail-panel.tsx` 为死代码 | 架构 lane | 24 | shipped | #184 | 两个文件已随空态切片删除（无 importer）；剩余 `OperationFilters` 的 `rail`/`grid` 分支仍无生产调用（`operation-filters.tsx:58,64-77`），留待后续 chore |
| FIX-6 | 导入配置不识别字面量 `[REDACTED]`，可能覆盖真实凭据 | SEC-1 panel | 27 | shipped | #114 | 四个凭据位置拒绝占位符，事务回滚；`config-portability.ts` 新增 `assertNotRedactedSecret` / `assertNoRedactedSecrets` |
| FIX-7 | Sources 页中文仍把 Source 译作「来源」 | requirements lane | 23 | shipped | #132 | 事件列头、路由来源条件、抑制匹配器、模板变量分组统一为「告警源」；保留「模板来源/样例来源」 |
| FIX-8 | 抑制的 `createdBy` 永远为空 | requirements lane | 26 | candidate | — | `suppression.service.ts:53-71` 未接收当前用户；详情页显示「未知」`suppression-detail-page.tsx:95-97` |
| SEC-1 | `isSensitiveKey` 漏掉 `appSecret/clientSecret/apiSecret/privateKey/X-Auth-Token` | 安全 lane | — | shipped | #107 | EXPERT_PANEL 一致：归一化键名 + 词尾规则；决策 `docs/planning/decisions/secret-redaction-coverage.md` |
| SEC-2 | 脱敏回归测试按 registry 而非 `DestinationKindSchema.options` | 安全 lane | 25 | shipped | #150 | 新增 registry kind 集合与 `DestinationKindSchema.options` 相等的断言 |
| SEC-3 | `env.ts` 直接读 `process.env` 但无 server-only 标记 | 安全 lane | 24 | shipped | #150 | 加 `@tanstack/react-start/server-only`；build 验证无客户端链路 |
| SEC-4 | Feishu app test 错误消息未过 `redactText` | 安全 lane | 24 | shipped | #150 | 失败消息经 `redactText`；新增平台回显 `app_secret` 用例 |
| Q-1 | 出站 HTTP 无超时，单个挂起目标会卡住单进程 worker | 质量 lane | — | shipped | #108 | EXPERT_PANEL 一致：共享层 10s deadline，`timeout`/可重试；决策 `docs/planning/decisions/outbound-http-timeout.md` |
| Q-2 | 出站响应体无上限 | 质量 lane | 26 | candidate | — | 与 inbound 的 body limit 对齐 |
| Q-3 | Provider `*Result` 函数对非对象 payload 直接 throw | 质量 lane | 25 | candidate | — | 边界契约不一致 |
| Q-4 | Destination service NOT_FOUND 分支无测试 | 质量 lane | 26 | candidate | — | 实测 6 个分支：update/delete/getTemplateDraft/test/preview/previewUpdate + sampleEventId；`configuration.integration.test.ts` 无 missing-id 用例 |
| Q-5 | History repository 查询覆盖薄 | 质量 lane | 27 | candidate | — | sourceId、组合筛选、越界页均无测试；损坏 `route_matches_json` 会让整页抛错（`history.repository.ts:385-393`）。第 18 轮补充：`raw_payload_json`/`provider_metadata_json`/`labels_json`（`intake.helpers.ts:55-70`）与 `rendered_payload_json`（`delivery.helpers.ts:46-48`）同样无读取容错 |
| Q-6 | 超时 `errorKind` 未持久化，Deliveries 只显示英文 `lastError` | Q-1 panel | 24 | candidate | — | `delivery-execution.ts:134-141`；需 forward-only 加列 + UI 文案映射 |
| Q-7 | 同批投递串行发送，慢投递仍造成队头阻塞 | Q-1 panel | 20 | candidate | — | `delivery-worker.service.ts:75-77`；超时已缓解，并发化需单独设计 |
| Q-8 | `markSucceeded` 抛错会被当作发送失败并重试，导致重复发送/重复 page | quality lane | 26 | candidate | — | `delivery-execution.ts:102-114` 在发送成功的主 try 内，catch（`:155-175`）按可重试处理；还会跳过 `triggerPings`（`:116-130`）。`delivery-execution.test.ts` fake 的 `markSucceeded` 永不抛错。**第 24 轮 EXPERT_PANEL 裁决单独处理**：投递成功还承载自动加急语义，直接落终态可能抑制呼叫，需单独权衡漏呼/重复 |
| Q-9 | 同批 attempt 共用 run 开始时间，`finishedAt == startedAt`，退避可能已过期 | quality lane | 24 | shipped | #128 | `DeliveryExecution.execute` 增加实时时钟，`markSucceeded/markFailed` 持久化真实 `startedAt`；耗时列不再恒为 0 |
| Q-10 | claim 后单条 execute 抛错会中断整批，剩余投递滞留 `running` | quality lane | 24 | candidate | — | `delivery-worker.service.ts:55-77,85-93`；无 post-claim 部分失败测试。第 18 轮补充：oncall worker 同构（`oncall-worker.service.ts:77-79,87-95`），可共用注入式失败测试。第 24 轮补充：`settings.get()` 在 `claimNext` 之后读取（`delivery-worker.service.ts:59-64`），读取失败会让整批已 claim 投递滞留 `running` 并在 5 分钟后被 stale reclaim 重发 |
| Q-11 | `resolveDestinationConfig` 两条错误分支无测试 | quality lane | 24 | shipped | #119 | 两条 fake resolver 用例：配置错误最终失败、未知错误脱敏 |
| Q-12 | `testDestination` 失败分支的脱敏 DTO 无测试 | quality lane | 24 | candidate | — | `destination.service.ts:187-194`；现有 fetch 永远 `ok: true` |
| Q-13 | worker 脱敏测试未注入 secret，只依赖驱动错误文本 | quality lane | 20 | candidate | — | `delivery-worker.service.test.ts:840-854`；应注入带 secret 的 fake store 错误 |
| REL-1 | CI 未接入 E2E | RC checklist A | 24 | candidate | — | `ci.yml:16-51` 仅 quality job；`vite.config.ts:51` 排除 `e2e/**`；全仓无 `playwright install`；`playwright.config.ts:7-9` 注释误称已有 workflow。**token 已有 `workflow` scope（2026-10-18 核实），阻碍是 gate 设计与 spec 覆盖，不是权限** |
| REL-2 | Provider payload fixture 目录 | RC checklist E | 27 | candidate | — | 6 个 adapter 测试文件、19 个内联 payload、31 个用例；`packages/providers/src/` 无 fixture 目录 |
| REL-3 | Docker smoke 使用全局卷名，`down -v` 会删正常数据卷 | 发布 lane | 28 | shipped | #162 | 新增 `docker-compose.smoke.yml`（`tocsin:smoke` + `tocsin-smoke-data`）；脚本启动前后断言解析配置与 `/data` 实际挂载源，日志在 teardown 前采集，curl 加超时；`just docker-smoke` 本地实跑通过 |
| REL-4 | E2E spec 覆盖面不足 | 发布 lane | 25 | candidate | — | 单个串行用例只覆盖 setup/source/destination/webhook/events；未创建 Route、未验证 Delivery/retry/filter/重启/导出（`alert-flow.spec.ts:27`） |
| REL-5 | build 产物启动与文件型 SQLite migration 无 CI smoke | 发布 lane | 24 | candidate | — | CI 只 `vp run -r build`；`.output/server/index.mjs` 仅 Dockerfile/手动 smoke 执行。10-18 建议先加 `scripts/artifact-smoke.sh`：临时目录 + 临时 SQLite + 固定 secret，启动产物轮询 `/api/ready`，断言 checks 全 ok 并清理 |
| ARCH-1 | `route-forms.tsx` 1027 行含两个导出组件 | 架构 lane | 25 | candidate | — | 拆 `create-route-form.tsx` / `edit-route-form.tsx`；第 16 轮核实已增至 1027 行（`:61` / `:127`，新增确认流程 `:714-745`） |
| ARCH-2 | `suppression-forms.tsx` 703 行含两个导出组件 | 架构 lane | 25 | candidate | — | 同上；`CreateSuppressionForm` L67、`EditSuppressionForm` L127 |
| ARCH-3 | `delivery-state-badge.tsx` 三个导出组件 | 架构 lane | 23 | candidate | — | 低优先级 |
| ARCH-4 | `system-information.ts` 五层相对路径导入根 `package.json` | 架构 lane | 23 | candidate | — | 走配置别名或单点 server adapter |
| ARCH-5 | service 直接构造并抛 `RecordNotFoundError` | architecture lane | 24 | candidate | — | `destination.service.ts:35,138,158,202,250,374`、`oncall.service.ts:7,59,73`；仓库已有 `requireDestination` |
| ARCH-6 | `/api/ready` 入口直接访问 SQLite store | architecture lane | 24 | candidate | — | `routes/api/ready.ts:10,19,22,26`；入口过厚，缺 readiness service |
| ARCH-7 | routes/suppressions section 内联 cell/actions/empty state | architecture lane | 23 | candidate | — | `routes-section.tsx:161,273,286,319,341`、`suppressions-section.tsx:173,194,200,247,260,363` |
| ARCH-8 | public i18n router 内联 locale 业务逻辑 | architecture lane | 22 | candidate | — | `server/orpc/features/i18n/router.ts:13-25`；缺 request-locale service |
| ARCH-9 | `locale-cookie.ts` 直接用浏览器 API 且被 server router 导入 | architecture lane | 23 | candidate | — | `locale-cookie.ts:29-35,37-47`；拆 `.client` 实现，neutral 部分保留 |
| DOC-1 | RC checklist 断言「抑制没有 UI 入口」 | docs drift | 27 | shipped | #117 | 两处校正为已实现，写明剩余未落地项 |
| DOC-2 | 4 处 `xqvvu/vane` 仓库链接过期 | docs drift | 25 | shipped | #117 | 全部改为 `xqvvu/tocsin`；issue #47 标注已关闭 |
| DOC-3 | 模板表单「只支持 Feishu 模式」等三处限制已过期 | docs drift | 26 | shipped | #117 | 三份文档更新为 manifest 驱动模式选择器与 Email 字段已落地 |
| DOC-4 | `next-round.md` 基线 `7b5d501` 过期，S0 已修复 | docs drift | 25 | shipped | #127 | 更新基线；标注 `a460a6f` 已修复；route explain/registry audit/test-kit/iconName 已落地 |
| DOC-5 | 迁移计划仍写「只有 0001 baseline」 | docs drift | 25 | shipped | #117 | AGENTS、sqlite-store、发布与备份文档统一为 0001–0003 |
| DOC-6 | 架构文档文件树漂移（`migrate.ts`、`auth/router.ts`、缺 suppressions） | docs drift | 24 | candidate | — | `sqlite-store.md` 已随 #117 修迁移/仓库树；`application-container.md`、`frontend-architecture.md` 仍待改 |
| DOC-7 | 抑制 PRD/决策文档状态仍写「草案/待拍板」 | docs drift | 24 | shipped | #117 | 状态头与迁移约束已更新 |
| DOC-8 | README/AGENTS.md 的 pnpm 版本过期 | docs drift | 23 | shipped | #117 | 对齐 `pnpm@12.14.0` |
| DOC-9 | 发布文档声称没有 E2E/smoke、迁移只有 0001 | release-infra lane | 27 | shipped | #117 | 区分脚本已存在与 CI 未接入；rel 文档更新 |
| DOC-10 | `route-explain-delivery-gap.md` 仍称「待实现」 | requirements lane | 24 | shipped | #117 | 状态与 R8 说明已对齐代码 |
| DOC-11 | `adapter-contribution-experience.md` 的「不存在」盘点部分过期 | docs drift | 24 | candidate | — | 第 13 轮复核：`audit()`(`registry.ts:83`)、test-kit(`package.json:18`)、`iconName`、贡献指南均已落地；剩余范围收窄为 **F5（HTTP 发送信封收敛）**。第 15 轮补充：`:17,117-118,131-158,169-171,341-342` 还称 `destinationSecretPaths` 是嵌套三元（实为穷尽 switch），剩余范围应为 F1/F2'/F5 |
| DOC-12 | `route-authoring-current-state.md` 去重证据断言过期 | docs drift | 23 | shipped | #127 | 拆成「去重已落库」与「skipExisting 仅计数」两行（`delivery_dedupe_keys`，`schema.ts:164-185`） |
| REQ-25 | 抑制规则试跑预览（dry-run） | requirements lane | 27 | candidate | — | PRD 承诺 `preview` 与范围预览，代码只有 list/get/hits；复用 `evaluateSuppressionMatch` + `listRecent`；`alert-suppression.md:97,209,238` |
| REQ-26 | Destination 用真实历史 Event 预览 | requirements lane | 29 | shipped | #122 | 预览对话框新增样例来源选择器（内置 + 最近 20 条历史 Event），三个预览入口均可重放；`recentEventsQueryOptions`、`destination-notices.tsx`、`destinations-page.tsx`；PRD `docs/prd/destination-historical-event-preview.md` |
| REQ-27 | Deliveries 列表显示告警身份 | requirements lane | 28 | shipped | #134 | 列表新增 `eventTitle/eventSeverity/eventStatus` 投影；事件列显示严重程度徽标 + 标题 + 告警源 · 状态 · ID；PRD `docs/prd/delivery-event-identity.md` |
| REQ-28 | 投递历史目标/路由名称快照 | requirements lane | 21 | candidate | — | 需 forward-only 0004 迁移；`history-retention-and-snapshots.md:47-83` |
| REQ-29 | 抑制规则保留期清理 | requirements lane | 24 | candidate | — | PRD 故事 28 未实现；设置项 + 有界 prune；`alert-suppression.md:105,224,237` |
| REQ-30 | 配置页搜索与过滤 | requirements lane | 25 | candidate | — | Sources/Routes/Destinations 三页只有新增/刷新；可复用 Events/Deliveries 筛选形态 |
| REL-6 | Docker smoke 断言弱于 checklist | release-infra lane | 26 | candidate | — | `test -f` 无法区分命名卷/匿名卷；`curl -f` 不校验 HTML；无 restart 持久化验证（`docker-smoke.sh:91-98`）；10-18 复核补：清理前先 `down -v` 导致失败日志丢失，三处 curl 均无 `--connect-timeout/--max-time` |
| REL-7 | E2E harness 就绪探针与隔离 | release-infra lane | 26 | candidate | — | 等 `/api/health` 而非 `/api/ready`；固定端口/DB 路径；globalSetup 默认值重复；未固定 locale（`playwright.config.ts:11,34,48`、`global-setup.ts:14-21`）。10-18 复核补：Playwright 先启动 webServer 再跑 globalSetup，删库发生在服务已打开并迁移之后；host 使用 `127.0.0.1` 违反 AGENTS 的 localhost 规则。10-19 复核补：`just e2e` 未安装 Playwright 浏览器，1.64.1 实测报 `chromium_headless_shell` revision 不匹配（`Justfile:78-79`）；应在 recipe/CI 显式 `playwright install chromium` |
| REL-8 | 生产构建 + 真实操作链路无门禁 | release-infra lane | 23 | candidate | — | E2E 跑 `vp dev`，smoke 只验 health；建议先加 `artifact-smoke.sh`，CI 形态需 EXPERT_PANEL |
| REL-9 | migration 仅 `:memory:` 覆盖，无文件库/WAL/校验和测试 | release-infra lane | 25 | candidate | — | `migrate.test.ts` 全部内存库；WAL 仅文件库（`connection.ts:29-31`）；runner 无 checksum |
| REL-10 | 备份恢复 runbook 存在 stale WAL 风险 | release-infra lane | 25 | candidate | #162（部分） | 快照无伴生文件时未删除旧 `-wal`/`-shm`（`backup-restore-upgrade.md:92-99`）仍待处理；`up -d --build` 与回滚镜像示例已由 #162 修正 |
| REL-11 | `.github/**` 被排除在 fmt/lint 外且无 actionlint | release-infra lane | 22 | candidate | — | `vite.config.ts:10,28,63` |
| REL-12 | 发布文档 Node 版本过期 | release-infra lane | 24 | shipped | #127 | `docker-production-deployment.md:28` 已改为 `26.12.0` |
| REL-13 | 公开仓库缺少 LICENSE 与 package `license` 字段 | release-infra lane | — | blocked-autonomous | — | PUBLIC 仓库、`licenseInfo: null`；属法律/产品决策，需专家小组，不可自动代选 |
| REL-14 | 发布卫生项（task cache / 供应链 / 构建上下文） | release-infra lane | 20 | candidate | — | Vite Task 缓存未持久化；node-gyp/actions 未固定；`.dockerignore` 未排除 `.output`；低优先 |
| ARCH-10 | `destination-form.tsx` 单体 1390 行 | architecture lane | 23 | candidate | — | `destination-form.tsx:82-1292`；适配器/模板/预览内联；建议与模板编辑器改造一起拆 |
| ARCH-11 | 抑制表单未使用 TanStack Form | architecture lane | 24 | candidate | — | `suppression-forms.tsx:193-236` 仍为 `useState` + 手写校验，违反 AGENTS 表单约定 |
| ARCH-12 | `hashSourceToken` 放在 intake service 并被跨服务导入 | architecture lane | 22 | candidate | — | `intake.service.ts:329-331`、`source.service.ts:18`、`config-portability.service.ts:33`；建议移到窄模块 |
| FIX-9 | `server/runtime/store.ts` 为死代码 | architecture lane | 24 | candidate | — | 无生产 importer，唯一引用是自身测试；`application-container.md:50` 仍声称存在 |
| FIX-10 | 未使用的生产依赖 | architecture lane | 20 | candidate | — | `@faker-js/faker`、`@tanstack/match-sorter-utils` 全仓无 import；确认后移除或降为 devDependency |
| FIX-11 | 侧边栏折叠状态刷新后丢失 | quality lane（第 21 轮） | 27 | shipped | #158 | `sidebar.tsx:70,82` 只写 `sidebar_state` cookie 从不读回；已改为挂载后恢复持久化状态，受控模式不干预，补组件测试 |
| DOC-13 | import boundaries 文档 4 处与代码不一致 | architecture lane | 24 | shipped | #127 | `withDashboardService` 示例、core operations 路径、`findDashboardContext()`、middleware 数量均已更正 |
| DOC-14 | sqlite-store 文档缺 suppressions 信息 | architecture lane | 23 | shipped | #127 | schema 列表补 `suppressions`，id 工厂补 `suppression` |
| REQ-31 | 排障搜索覆盖事件/投递 ID | requirements lane | 29 | shipped | #125 | 事件谓词加 `events.id` + 所属投递 `EXISTS`；投递谓词加 `deliveries.id`/`events.id`；列表与 total 同谓词；PRD `docs/prd/operation-search-identifiers.md` |
| REQ-32 | 解析失败事件的诊断可见性 | requirements lane | 28 | candidate | — | 审计事件已写 providerMetadata，但列表/详情/筛选都看不到；`intake.service.ts:191-239`、`event-raw-tab.tsx:13-28` |
| REQ-33 | 绝对时间窗口过滤 | requirements lane | 27 | candidate | — | URL `from`/`to`，与 `range` 互斥；仓储只有 `since` 没有上界；`operations.ts:26-28`、`history.interface.ts:23-49` |
| REQ-34 | 筛选结果导出 CSV | requirements lane | 27 | candidate | — | 只读 `operations.export`，上限 5000 行，CSV 公式注入转义；`packages/api/src/contract/operations.ts:36-88` |
| REQ-35 | 运维列表自动刷新 | requirements lane | 27 | candidate | — | 15/30/60s 开关；全仓无 `refetchInterval`；Deliveries 连手动刷新都没有（`deliveries-page-toolbar.tsx:21-46`） |
| REQ-36 | 事件列表标签可见性 | requirements lane | 27 | candidate | — | `EventListItem` 无 labels；`history.repository.ts:52-77`；详情已有全量标签（`event-normalized-tab.tsx:66`） |
| DOC-15 | 部署文档称「没有内置登录限流」 | docs drift | 27 | shipped | #123 | Better Auth production 默认启用限流（10s/100，登录 10s/3）；同时补 `TOCSIN_DESTINATION_TIMEOUT_MS` |
| DOC-16 | RC checklist/post-MVP/template follow-up 状态过期 | docs drift | 26 | shipped | #123 | compose smoke 已存在、模板四种模式已交付、抑制主体已交付 |
| DOC-17 | adapter-extensibility 称无 registry audit 且模板模式未扩展 | docs drift | 25 | shipped | #123 | `registry.ts:83` 已有 `audit()`；四种模式已落地 |
| DOC-18 | 架构文档 typecheck 命令与 session namespace 过期 | docs drift | 24 | shipped | #123 | 两处 `vp -C apps/console run typecheck` 改为 `vp check`；`auth.*` 改 `session.*`；ADR 0007 命名空间补齐 |
| REQ-37 | 投递搜索覆盖失败原因/目标/路由 | requirements lane | 29 | shipped | #130 | 谓词增加 `last_error` + 目标/路由关联 `EXISTS`；列表与 total 同谓词；占位文案按页面区分；PRD `docs/prd/delivery-search-fields.md` |
| REQ-38 | 投递详情页重试闭环 | requirements lane | 29 | shipped | #126 | 详情页工具栏新增 `DeliveryRetryButton`（仅 failed 态），复用 `operations.retryDelivery`；成功后失效 operations 查询；PRD `docs/prd/delivery-detail-retry.md` |
| REQ-39 | 静默窗口剩余时间与一键续期 | requirements lane | 27 | candidate | — | 列表/详情只显示起止时间（`suppressions-section.tsx:247-258`、`suppression-detail-page.tsx:83-92`）；core 已有派生状态（`suppression.ts:79-96`） |
| REQ-40 | 详情返回保留列表筛选 | requirements lane | 26 | candidate | — | 详情返回固定跳 `/events`、`/deliveries`（`event-detail-page.tsx:63-69`、`delivery-detail-page.tsx:49-55`），筛选与分页丢失 |
| REQ-41 | 告警源接入指引 | requirements lane | 26 | candidate | — | 创建提示只有 URL/Token（`source-token-notice-panel.tsx:16-79`），provider catalog 无接入步骤/示例（`packages/providers/src/types.ts:68-79`）；Generic 文案还声称支持 JSON 字段映射 |
| REQ-42 | 告警送达时效剖面 | requirements lane | 29 | shipped | #128 | 摘要新增创建/结束时间与排队、发送、端到端耗时；attempts 表新增耗时列；PRD `docs/prd/delivery-detail-diagnostics.md`；同时修复 Q-9 |
| REQ-43 | attempt 响应体/错误全文查看 | requirements lane | 29 | shipped | #128 | 尝试错误/响应单元格可点开对话框，完整展示已脱敏 error/responseBody，JSON 格式化并支持复制 |
| REQ-44 | 未匹配路由事件直接补路由 | requirements lane | 27 | candidate | — | 事件详情只有静默/重放/返回（`event-detail-page.tsx:57-71`）；新建路由表单无初始 rule 入口（`route-forms.tsx:50-90`）；默认不追溯 intake 快照 |
| REQ-45 | 当前筛选窗口投递失败聚合 | requirements lane | 27 | candidate | — | 只有逐行列表；需只读 summary procedure + Top N 目标/错误分组（`operations.ts:36-88`、`history.repository.ts:212-290`） |
| REQ-46 | 事件排障摘要一键复制 | requirements lane | 27 | candidate | — | 只能复制单个标识符（`event-detail-term.tsx:7-44`）；摘要所需字段均已在页面（`event-detail-summary.tsx:11-71`） |
| DOC-19 | RC checklist 仍把已交付排障能力列为下一轮候选 | docs drift | 26 | shipped | #127 | `mvp-rc-checklist.md:188` 补状态：筛选/时间范围/ID 搜索/route explain 已落地；fingerprint 视图等仍未做 |
| DOC-20 | `destination-historical-event-preview.md` 现状陈述与已实现状态矛盾 | docs drift | 22 | shipped | #127 | 现状陈述改为过去时，与顶部「已实现」一致 |
| DOC-21 | RC checklist 声称 dedupe cleanup 已改为有界批 | docs drift | 27 | shipped | #135 | 已勾选 gate 收窄为 raw payload pruning，新增未勾选的 dedupe cleanup gate；`history-retention-and-snapshots.md` §2 增加范围说明。代码缺口转 Q-23 |
| DOC-22 | `next-round.md` 仍把 S0 与抑制写成未决安全缺口 | docs drift | 25 | candidate | — | S0 已在 `config-portability.ts:358-370` 用穷尽 switch 修复；抑制主体已落地且 2026-10-12 拍板（`alert-suppression-decisions.md:3`）。第 15 轮补充：基线 `:3` 为 `2f48153`（第 19 轮实测落后 32 提交，以 `git rev-list --count 2f48153..origin/main` 为准），正文 `:22-23,31-43,72-73,119-128,142-154,210-226,313-324,361-369` 仍称 registry 无 audit、test-kit/iconName/F3/F4/F7 待做；`registry.ts:83`、`package.json:18`、`destination-kind-icon.tsx:26-34` 均已落地 |
| DOC-23 | 架构文档文件树/路由/工厂清单过期 | docs drift | 24 | candidate | — | `frontend-architecture.md:37-108` 缺 suppressions/integrations/settings/setup 与 csrf；`application-container.md:57` 写 `auth/router.ts`（实为 `session/router.ts`）且缺 `createSuppressionService`。第 15 轮补充：`container.ts:85,107,110-112` 另有 `createEventReplayService`/`createOperationsService`/两个 worker runner；frontend 树缺 `auth/integrations/suppressions`（`deliveries/model` 已存在、`configuration/model` 不存在）；server 树缺 `oncall/suppressions` 与 `operations.service.ts`；`frontend-architecture.md:83` 实际另有 `csrf.middleware.ts`（`start.ts:3-7`） |
| DOC-24 | 抑制 PRD 承诺不存在的 preview 且 AC 未勾选 | docs drift | 24 | candidate | — | `alert-suppression.md:238` 列 `preview`，实际 contract 无该过程（`packages/api/src/contract/suppressions.ts:21-63`，preview 是 REQ-25）；`:275-294` AC 全未勾选；`:289` 仍写四状态；第 19 轮补充：`:43,338` 也仍写四状态（见 DOC-37） |
| DOC-25 | post-MVP 规划低估已交付的缺口解释与保留策略 | docs drift | 23 | candidate | — | `post-mvp-planning.md:215` 称缺投递缺口解释，实际 `routeMatchGaps` + `event-detail-route-gaps.tsx` 已上线；`:137` 的 retention 已决定不自动清理（`history-retention-and-snapshots.md:14`） |
| DOC-26 | 三个已交付 mini-PRD 仍用现在时描述问题 | docs drift | 22 | candidate | — | `delivery-retention-notice.md:10-12`（#111）、`event-fingerprint-silence.md:5-7`（#116）、`raw-payload-pruned-state.md:9-12`（#118）均已落地，缺状态注记 |
| DOC-27 | 版本与路径类细节过期 | docs drift | 20 | candidate | — | ADR 0008 写 setup-vp@1.21.1 / vite-plus:1.0.0（实际 `ci.yml:32` 为 1.21.2、`Dockerfile:4` 为 1.1.0）；ADR 0003 与 restructure-plan 仍指 `server/functions/`；`route-authoring-current-state.md:3` 用旧 `devs/vane` 路径 |
| REQ-47 | 投递详情展示外部消息引用 | requirements lane | 29 | shipped | #131 | 摘要字段展示可复制的引用值 + 机器类型；无引用显示 `-`；PRD `docs/prd/delivery-provider-reference.md` |
| REQ-48 | 配置删除影响预检 | requirements lane | 25 | candidate | — | 第 23 轮复核：Source/Destination 删除只清路由引用，不检查 suppression JSON 引用（`source.service.ts:76-85`、`destination.service.ts:120-129`）；全量 25 分，仅 Source+Destination 约 27 分（60–75 分钟）；**不得自动删除失效 matcher ID**（可能把规则放宽为无条件静默），只做可见 + 预检 |
| REQ-49 | 可移植配置覆盖抑制规则 | requirements lane | 27 | candidate | — | `ConfigurationSchema` 只含 settings/feishuApps/sources/destinations/routes（`packages/core/src/config.ts:85-90`）；备份/迁移会静默丢失静默窗口 |
| REQ-50 | 投递详情内联目标诊断与测试 | requirements lane | 26 | candidate | — | 详情工具栏无目标测试入口（`delivery-detail-page.tsx:46-64`）；可复用 `destinations.test` 与详情 DTO 的 `destinationMetadata` |
| REQ-51 | 接入侧拒绝与鉴权失败可观测 | requirements lane | 23 | candidate | — | `invalid_token`/`source_disabled` 等只写日志（`intake.service.ts:64-76,317-327`）；需 forward-only 0004 + 有界遥测 + Sources 列 |
| ARCH-13 | ConfigPortabilityService 直接读 `process.env` | architecture lane | 22 | candidate | — | `config-portability.service.ts:99,109` 写死 `process.env`；options 无 readEnv，container 无法注入测试环境 |
| ARCH-14 | `migrate/runner.ts` 冗余 server-only 标记 | architecture lane | 18 | candidate | — | `runner.ts:1` 自身不使用服务端 API，服务端约束已由上层传递；与 AGENTS 标记规则不符 |
| Q-14 | 退避翻倍与上限分支未测 | quality lane | 24 | candidate | — | `delivery-execution.ts:219-222`；现有测试全用 60s/60s 且 attemptCount=1 |
| Q-15 | 重试/加急按钮完成后未断言恢复可用 | quality lane | 24 | candidate | — | `delivery-retry-button.tsx:39-40`、`delivery-buzz-button.tsx:34-35`；删掉 `finally` 后测试仍绿 |
| Q-16 | 分页 parity 测试自证 | quality lane | 23 | candidate | — | `deliveries-pagination-parity.test.tsx:44-45,64-66,75-76` 两次渲染同一 helper，EventsTable 从未渲染 |
| Q-17 | 投递详情页 null / 重试门槛无测试 | quality lane | 25 | candidate | — | `delivery-detail-page.tsx:25-35,58`；仓库无 `delivery-detail-page.test.tsx` |
| Q-18 | 抑制提示降级数据分支未测 | quality lane | 22 | candidate | — | `delivery-suppression-notice.tsx:33,36-45`；现有测试只覆盖字段齐全的数据 |
| Q-19 | 列表页重试/手动 worker 错误路径无测试 | quality lane | 24 | candidate | — | `deliveries-page.tsx:75-90` 的 catch；`DeliveryActions` 无测试文件 |
| REQ-52 | 模板 `tocsin.eventUrl` 生产恒为空 | requirements lane | 28 | candidate | — | 所有渲染调用点未传 `eventUrl`，且无公开访问地址配置；建议新增 `TOCSIN_PUBLIC_URL`；`template.ts:369-399`、`feishu/payload.ts:18`、`destination.service.ts:299` |
| REQ-53 | 加急记录缺触发人/呼叫时间/下次重试 | requirements lane | 29 | shipped | #140 | 触发方式下显示 `initiatedBy`；新增呼叫时间/下次重试两列；PRD `docs/prd/oncall-ping-audit-fields.md` |
| REQ-54 | 告警源覆盖无法区分无路由与仅停用路由 | requirements lane | 27 | candidate | — | Source 侧无 `disabledRouteCount`，0 条统一显示「未匹配路由」；`source-route-coverage.ts:11-27`、`source-route-coverage-cell.tsx:22-30` |
| REQ-55 | 全静默事件摘要未计入已抑制 | requirements lane | 27 | candidate | — | 摘要只传 succeeded/failed；统计函数已有 suppressed；`event-detail-summary.tsx:43-49`、`event-detail-stats.ts:3-15` |
| REQ-56 | 被抑制投递无逐项匹配说明 | requirements lane | 25 | candidate | — | PRD 故事 26；核心 matcher 已有 checks，但未投影；建议只读读时重算并标注口径；`suppression.ts:134-141,155-186`、`delivery-suppression-notice.tsx:20-60` |
| ARCH-15 | oRPC `runDeliveryWorker` 在 router 内编排 worker | architecture lane | 23 | candidate | — | `server/orpc/features/operations/router.ts:64-77`；建议下沉 worker/health service |
| ARCH-16 | auth 复杂表单仍在 route-colocated 文件 | architecture lane | 22 | candidate | — | `routes/-login-form-impl.tsx:27-173`、`routes/-setup-form-impl.tsx:23-207`；应迁 `features/auth/{model,ui}` |
| ARCH-17 | 浏览器 API 模块缺 client-only 标记 | architecture lane | 23 | candidate | — | `route-forms.tsx:809-811`、`components/ai-elements/code-block.tsx:404-423`；后者另有一套剪贴板路径。第 21 轮补充：侧边栏提交新增 `hooks/use-mobile.ts:1-16`（`window`）、`components/ui/sidebar.tsx:82,101`（`document.cookie`/`window`）、`components/ui/sheet.tsx` 仅 `"use client"`，均缺 TanStack 标记 |
| ARCH-18 | 抑制详情命中分页未进 URL | architecture lane | 24 | candidate | — | `suppression-detail-page.tsx:34,39,119`；刷新回第 1 页 |
| ARCH-19 | Event/Delivery DetailTerm 重复且换行策略分叉 | architecture lane | 25 | candidate | — | `delivery-detail-term.tsx:59` 用 `wrap-break-word`，可能裁切长引用；建议下沉 `components/common` 并统一 `break-all` |
| Q-20 | 旧库升级 `normalized_json` 未回填 | quality lane | 22 | shipped | #136 | EXPERT_PANEL 采用读取容错（A）：`'{}'` 占位符按列重建，不写库、无迁移；同时解除 claim 事务毒丸。决策 `docs/planning/decisions/legacy-normalized-event-repair.md` |
| Q-21 | 搜索框无 120 字符上限导致列表错误页 | quality lane | 28 | shipped | #141 | `@tocsin/core` 导出 `OPERATION_SEARCH_MAX_LENGTH`；输入框 `maxLength` + `pruneSearch` 截断，contract 共用同一常量 |
| Q-22 | 复制按钮与响应体回退分支缺测试 | quality lane | 25 | candidate | — | 只断言按钮存在；非 JSON 响应体回退无测试；`delivery-summary-tab.test.tsx:52-67`、`delivery-attempt-detail-dialog.tsx:151-185` |
| Q-23 | dedupe cleanup 无界 DELETE 仍在 enqueue 热路径 | DOC-21 | 25 | candidate | — | `pruneDedupeKeys` 无 LIMIT，每次 enqueue 执行；`delivery.helpers.ts:98-99`、`delivery.repository.ts:95` |
| REQ-57 | Route 全空条件（catch-all）保存护栏 | requirements lane | 29 | shipped | #138 | `routeRuleIsEmpty` + 提交前确认对话框；新建/编辑共用；PRD `docs/prd/route-catchall-confirmation.md` |
| REQ-58 | 失败投递区分「等待重试」与「重试耗尽」 | requirements lane | 27 | candidate | — | 列表 DTO 缺 `maxAttempts`；`operations.ts:86-113`、`history.repository.ts:224-244,284-297`、`delivery-state-badge.tsx:12`。第 21 轮收窄：状态机上 `pending`+`next_attempt_at` 与 `failed`+空已可区分，真正缺口是列表展示 `2/3` 与明确的退避/耗尽文案 |
| REQ-59 | 配置对象 → 过滤后历史的一键钻取 | requirements lane | 27 | candidate | — | 复用现有 `sourceId/destinationId/routeId/q` URL 参数；`operation-search.ts:12-23`、`history.repository.ts:246-263`、`source-actions.tsx:46-160`、`destination-actions.tsx:56-150`、`routes-section.tsx:185-265` |
| REQ-60 | 停用对象滞留投递的列表可见性与恢复预警 | requirements lane | 26 | candidate | — | 列表投影 `destinationEnabled/routeEnabled` + 只读 `previewPausedBacklog`；`delivery.repository.ts:215-232`、`operations.ts:86-113`、`delivery-retention-notice.tsx:1-20` |
| REQ-61 | 从投递详情按目标一键静默 | requirements lane | 26 | candidate | — | 复用 suppression matcher 的 `destinationIds`；`delivery-detail-page.tsx:38-60`、`suppression-from-event-dialog.tsx:38-68`、`suppression.ts:19-40` |
| REQ-62 | Dashboard 账户安全：修改密码与会话撤销 | requirements lane | 25 | candidate | — | Better Auth 已内置能力，session 表含 ip/UA；`dashboard-user-menu-impl.tsx:80-111`、`auth-options.ts:67-69`、`auth-owner-bootstrap.ts:11-26` |
| REQ-63 | Source 接入鉴权状态可见 | requirements lane | 25 | candidate | — | 仅派生 `sharedSecretConfigured` 布尔值，不返回 secret；`source.ts:9-14`、`sources-section.tsx:38-77`、`edit-source-form.tsx:38-52`、`intake.service.ts:344-374` |
| REQ-64 | Event/Delivery 详情 Tab 写入 URL | requirements lane | 25 | candidate | — | 详情路由无 `validateSearch`，Tabs 非受控；`event-detail-view.tsx:25-27`、`delivery-detail-view.tsx:23-25`、对应 route 文件 |
| SEC-5 | 自定义 header 值在配置导出中明文出现 | security lane | 27 | shipped | #137 | **HIGH**：导出与编辑 DTO 现在全量遮蔽 header 值；不可表达名称 fail-closed、env 名冲突拒绝、陈旧 refs 裁剪；决策 `docs/planning/decisions/destination-header-redaction.md`；删除语义转 REQ-71 |
| SEC-6 | `tokenHash` 不在脱敏 helper 覆盖内 | security lane | 23 | shipped | #150 | 精确集合加入 `tokenhash`；`payloadHash`/`hash` 仍可见，正反例测试已补 |
| DOC-28 | RC checklist 对 E2E/compose smoke 是否进 CI 自相矛盾 | release-infra lane | 24 | shipped | #145 | 统一为「E2E 未接入 CI，compose smoke 故意保留为本地人工 gate」 |
| REQ-65 | 全局静默生效提示 | requirements lane | 28 | shipped | #161 | Dashboard header 常驻指示器：只统计 `active`，显示数量并链接 `/suppressions`；无条件规则用 destructive「全量静默生效中」；每 30s 重算、加载/失败时隐藏。PRD `docs/prd/active-suppression-indicator.md` |
| REQ-66 | 按外部消息引用反查投递 | requirements lane | 28 | shipped | #157 | 详情已展示 `providerReference`，搜索谓词不含 `provider_ref_value`；`history.repository.ts:435-455`、`schema.ts:126-127`、`operations.ts:124-133`；只读 LIKE，列表与 total 同谓词。第 21 轮交付：谓词增 `provider_ref_value`、Deliveries 占位文案、仓储与组件测试；PRD `docs/prd/delivery-provider-reference-search.md` |
| REQ-67 | 事件列表解释「命中路由但 0 投递」 | requirements lane | 27 | candidate | — | `routeMatchCount>0 && total=0` 只显示裸 `0`，与详情 route gaps 不一致；`event-delivery-counts-cell.tsx:35-55`、`events-table.tsx:72-80`；纯 UI 三分支 |
| REQ-68 | 路由一键复制 | requirements lane | 26 | candidate | — | 新建相似路由需重填全部条件；`routes-section.tsx:161-223`、`route-add-dialog.tsx:18-34`、`route-forms.tsx:50-87`；前端 feature 内 |
| REQ-69 | 新建/编辑静默时提示重叠规则 | requirements lane | 25 | candidate | — | 表单不提示与 active/scheduled 静默的窗口重叠；`suppression-add-dialog.tsx:21-32`、`suppression-forms.tsx:209-228`；只读提示，不阻止保存 |
| REQ-70 | 出站投递支持标准代理环境变量 | requirements lane | 25 | candidate | — | 所有出站 `fetch` 直连，Docker CMD 未启用 Node 代理解析；`transport.ts:72-77`、`Dockerfile:75`、`docker-production-deployment.md:65-78`；需 EXPERT_PANEL（启动参数/网络语义） |
| DOC-29 | `next-round.md` 基线与 backlog「已知过期输入」互相矛盾 | docs-drift lane | 24 | shipped | — | 第 19 轮关闭：backlog「已知过期输入」已统一为 `2f48153` 与按 `git rev-list --count` 计算；基线落后问题由 DOC-22 继续跟踪 |
| DOC-30 | `route-authoring-current-state.md` 现状盘点大面积过期 | docs-drift lane | 24 | shipped | #145 | 文首补状态校正：缺口解释、route×destination 视图、多条件编辑均已落地 |
| DOC-31 | RC checklist 对 delivery history retention 自相矛盾 | docs-drift lane | 25 | shipped | #145 | 统一为「决定不自动清理」，仅保留容量信号为真实缺口 |
| DOC-32 | 抑制决策记录称参数化脱敏测试未补，实际已存在 | docs-drift lane | 24 | shipped | #145 | 改为「测试已闭环，残留仅 SEC-2 的 kind 派生来源」 |
| REQ-71 | Destination header 显式删除语义 | SEC-5 panel | 24 | candidate | — | 编辑表单留空=保留、删行也=保留（`form-data.ts:26-46`、`configuration-support.ts:125-138`）；全量遮蔽后更难察觉；需 contract + 表单显式删除 |
| Q-24 | 接入侧 prune sweep 单飞按请求失效 | quality lane | 27 | shipped | #144 | 单飞状态移入 container 持有的 `RawPayloadSweepGate` 并注入每个实例；新增双实例并发只触发一次 sweep、释放后可再次触发的测试 |
| Q-25 | 重放/历史预览把 raw payload 清理哨兵当真实载荷 | quality lane | 26 | candidate | — | `{"retentionPruned":true}` 未在重放与样例预览中过滤（`event-replay.service.ts:49-81`、`delivery-execution.ts:95`、`destination.service.ts:371-390`）；事件详情页已隐藏（`event-detail-page.tsx:62` 仍启用重放） |
| Q-26 | 抑制窗口字符串字典序比较，带偏移 ISO 时间会超期静默 | quality lane | 25 | candidate | — | `suppressionStateAt` 直接比较字符串（`suppression.ts:82-97`）；API 接受任意偏移（`suppression.service.ts:50-57`）；`+08:00` 结尾会多静默数小时；应改用 `Date.parse` 或 schema transform |
| Q-27 | 告警源覆盖率把条件路由算成全覆盖 | quality lane | 24 | candidate | — | `routeCoversSource` 只要 `sourceIds=[]` 就算覆盖（`source-route-coverage.ts:16-31`）；`{severities:["critical"]}` 会让 warning/info 静默丢失；`catchAllRouteCount` 同样误判 |
| Q-28 | oncall worker 批次共用开始时间 | quality lane | 22 | candidate | — | `OncallWorker.runOnce` 把批次 `now` 传给每次 execute（`oncall-worker.service.ts:77-79`、`oncall-execution.ts:97-98,138-143`）；`fired_at` 与退避基准偏早；对照 Q-9 的 live clock 修复 |
| Q-29 | 历史样例选择器错误/空态分支无测试 | quality lane | 20 | candidate | — | `destination-notices.tsx:131,150-158` 的 pending/error/empty 三态无覆盖（`destination-notices.test.tsx:94-164`）；`delivery-event-cell.test.tsx:56,72` 仅否定断言 |
| REQ-72 | 手动加急一键呼叫无确认 | requirements lane | 29 | shipped | #143 | 确认框展示接收人数与不可撤销后果；`urgentReceiverCount` 为 0 时禁用并说明；PRD `docs/prd/oncall-buzz-confirmation.md` |
| REQ-73 | 静默时间窗时区语义不一致 | requirements lane | 28 | candidate | — | `datetime-local` 按浏览器时区解释，列表/详情按设置时区显示；`suppression-form.ts:118-128,160-184`、`operation-format.ts:11-28` |
| REQ-74 | Events/Deliveries 排序方向 | requirements lane | 27 | candidate | — | URL `order=asc\|desc`，列表与 total 共用谓词；`history.repository.ts:79-80,241-242`、`operations.ts:201-217` |
| REQ-75 | 静默详情页缺生命周期操作 | requirements lane | 26 | candidate | — | 详情页只有返回；复用启停/编辑/删除/续期入口；`suppression-detail-page.tsx:62-75`、`suppressions-section.tsx:260-299` |
| REQ-76 | 加急可用性预判 | requirements lane | 25 | candidate | — | 0 个 urgent 接收人时禁用并说明；`delivery-buzz-button.tsx:20`、`destination.helpers.ts:190-191` |
| REQ-77 | 投递诊断摘要一键复制 | requirements lane | 25 | candidate | — | 脱敏摘要：投递/事件 ID、目标、路由、状态、尝试、错误；`delivery-detail-summary.tsx:43-68` |
| REQ-78 | 列表搜索逐键请求 | requirements lane | 25 | shipped | #171 | 与 UI-1 同一修复：本地草稿 + 300ms 防抖，一次输入只提交一次查询；`operation-filters.tsx`、`operation-search.ts` |
| REQ-79 | 设置保存无条件整页刷新 | requirements lane | 24 | candidate | — | 仅改保留天数也 `hardReloadPage`；`settings-preferences-panel.tsx:59-64` |
| REQ-80 | 投递详情解释「为什么命中这条路由」 | requirements lane | 29 | shipped | #146 | 摘要页并列「接入时快照」与「当前规则」，区分无快照/快照不含该路由/快照未命中；检查徽章抽到 `features/routes/ui/`；PRD `docs/prd/delivery-route-match-evidence.md` |
| REQ-81 | 告警源行一键临时静默该源 | requirements lane | 27 | candidate | — | Source 行只有编辑/轮换/启停/删除（`source-actions.tsx:21-34`）；matcher 原生支持 `sourceIds`（`suppression.ts:155-179`）；复用 `CreateSuppressionForm`；停用源会丢排障证据 |
| REQ-82 | 详情页跨域引用可导航并定位配置行 | requirements lane | 25 | candidate | — | 源/路由/目标名均为纯文本（`delivery-summary-tab.tsx:16-31`、`event-detail-route-matches-table.tsx:62-66`）；配置路由无 `validateSearch`（`_dashboard.sources.tsx:7-17` 等）；需 `focus` 参数 + 自动翻页高亮 |
| REQ-83 | 补投预览标注将被静默的目标 | requirements lane | 26 | candidate | — | 预览不判断抑制（`event-replay.service.ts:173-186,246-281`），实际入队会落 `suppressed`（`delivery.repository.ts:90-93,131-164`）；DTO 增 `suppressedBy`/`deliverableCount` |
| REQ-84 | Settings 展示运行时与版本信息 | requirements lane | 26 | candidate | — | 启动时已收集版本/Node/SQLite（`system-information.ts:10-45`），但未暴露到 dashboard；`/api/health` 仅 `{status:"ok"}`（`health.ts:5-11`）；受 dashboard auth 的只读投影 |
| REQ-85 | 配置变更审计（谁在何时改了什么） | requirements lane | 21 | candidate | — | 无配置审计表（`schema.ts:7-111`），service 入参无操作者（`source.service.ts:38-77`）；需 forward-only migration + actor 传递 + Settings 视图，建议先写决策记录并交 EXPERT_PANEL |
| ARCH-20 | Destination 密钥路径策略三处重复 | architecture lane | 25 | candidate | — | manifest `secretFields` 未被消费；`feishu/manifest.ts:126`、`generic-webhook/manifest.ts:57`、`destination.helpers.ts:233`、`config-portability.ts:428` |
| ARCH-21 | 编辑器草稿映射放在 SQLite repository helper | architecture lane | 21 | candidate | — | `destination.helpers.ts:108,390`、`destination.service.ts:149`；UI DTO 形状落在 infra |
| ARCH-22 | 纯领域逻辑 `route-match-gaps.ts` 落在 repository 目录 | architecture lane | 21 | candidate | — | 只依赖 core 类型、无持久化；`route-match-gaps.ts:1-60`、`history.repository.ts:22` |
| ARCH-23 | 注入的 container 在 dashboard 会话解析中被绕过 | architecture lane | 20 | candidate | — | `request-context.ts:46-57,86-88` 固定调用 `getApplicationContainer()` |
| ARCH-24 | core 模块契约文件位置与 AGENTS 不一致 | architecture lane | 17 | candidate | — | `operations.ts`、`config.ts` 在包根且已有 `configuration/`；AGENTS.md:69 |
| ARCH-25 | 空条件确认对话框重复实现 | architecture lane | 18 | candidate | — | `route-forms.tsx:714-745` 与 `suppression-forms.tsx:467-497` 同构 |
| ARCH-26 | feature `model/` 混入 React hook 与 i18n 上下文 | architecture lane | 18 | candidate | — | `operation-format.ts:1,12-22` 被 `delivery-diagnostics.ts:6` 跨 feature 导入 |
| REL-15 | 发布手册的手工 Docker 冒烟不隔离 | release-infra lane | 24 | shipped | #162 | 手册删除裸 `docker compose up/down -v` 路径，统一指向隔离的 `just docker-smoke` |
| REL-16 | CI 不是强制门禁 | release-infra lane | 21 | candidate | — | main 无 branch protection/ruleset，红 CI 仍可合并；`.github/workflows/ci.yml:16-18` |
| REL-17 | `.dockerignore` 漏掉 Playwright 产物与 `.wt/` | release-infra lane | 22 | shipped | #177 | 增加 `**/test-results`、`**/playwright-report`、`**/blob-report`、`**/.playwright`、`.wt`，与 `.gitignore:29,40-43` 对齐 |
| REL-18 | 发布手册 readiness 无重试 | release-infra lane | 23 | candidate | — | `release-checklist.md:45-46` 立即 curl；脚本已有轮询 `docker-smoke.sh:64-79` |
| REL-19 | 本地 E2E 失败无 trace | release-infra lane | 23 | candidate | — | 本地 `retries=0` + `trace: on-first-retry`；`playwright.config.ts:23,28` |
| REL-20 | `just docker-buildx` 对 ACR 缺 `--provenance=false` | release-infra lane（第 22 轮） | 26 | shipped | #162 | ACR 拒绝 BuildKit OCI attestation manifest；Justfile 已加 `--provenance=false --sbom=false`，发布文档同步 ACR registry/tag 约定 |
| DOC-33 | RC 未勾选 gate 实为 4 条而非 3 条 | release-infra lane | 21 | candidate | — | 漏算 provider 多版本 payload；`mvp-rc-checklist.md:123,165,171,172` |
| Q-30 | 加急呼叫持久化失败会被当作可重试，导致重复呼叫 | quality lane | 26 | shipped | #168 | `markFired` 在外层 try 内（`oncall-execution.ts:97`），抛错后落可重试分支（`:115-131`）；电话已拨出。第 24 轮 EXPERT_PANEL 三方一致：受理后持久化失败不得重排、不得抛错；`markFired` 幂等重试一次后落终态 `retryAt:null`，错误文案写明「已呼叫」；不新增状态/迁移；Q-8 单独处理。决策 `docs/planning/decisions/oncall-fired-persistence-failure.md`；测试 `oncall-execution.test.ts` |
| Q-31 | `buzzDelivery` 部分入队失败仍会呼叫已入队 ping | quality lane | 23 | candidate | — | 逐条 `enqueueForDelivery` 无事务（`oncall.service.ts:91-109`）；操作员看到错误但已有 ping 落库并会被呼叫 |
| Q-32 | `toLocaleLowerCase()` 受宿主 locale 影响 | quality lane | 22 | candidate | — | severity/status 归一化（`normalization.ts:5,23`）、contains 匹配（`route.ts:325,330`）、header 查找（`intake.service.ts:406,409`）；土耳其语环境 `INFO`→`ınfo` 会漏投 |
| Q-33 | Webhook 鉴权顺序允许枚举 Source 存在/停用 | quality lane | 23 | candidate | — | 先查 source/启停再验 token（`intake.service.ts:62-77`），未知→404、已知错 token→401、停用→403；建议统一 401 |
| Q-34 | `formatTime` 对损坏时间戳抛 `RangeError` | quality lane | 20 | candidate | — | `operation-format.ts:31-47` 无非法值兜底；单条脏数据会让整页进入 error boundary |
| Q-35 | ping 表测试用破折号数量代理列完整性 | quality lane | 17 | candidate | — | `delivery-pings-table.test.tsx:45` 断言 3 个 `—`；列调整即失败，且无法发现语义错误 |
| Q-36 | 自动加急部分入队被静默吞掉 | quality lane（第 24 轮） | 22 | candidate | — | `delivery-execution.ts:116-130` 仅 warn；`oncall.service.ts:168-187` 逐 receiver 独立事务，中途失败只呼叫了子集且无补偿/重试；与 Q-31 同族，建议一并事务化 |
| Q-37 | oncall dedupe cleanup 同样是无界 DELETE | quality lane（第 24 轮） | 20 | candidate | — | `oncall.repository.ts:38-41` 每次 enqueue 在写事务内清理窗口外全部 key；Q-23 的 oncall 同构路径，建议有界删除 |
| Q-38 | Source token 复制失败仍弹成功 toast | requirements lane（第 26 轮） | 24 | candidate | — | 剪贴板失败分支调用 `toast.success`（`source-token-notice-panel.tsx:48-55,65-72`）；应改错误提示并补测试 |
| Q-39 | 错误页把占位符当 trace ID 展示 | requirements lane（第 26 轮） | 20 | candidate | — | `dashboard-error.tsx:61-63` 渲染 `shell.error.traceId`，其值为 `[REDACTED_TRACE_ID: generated_server_side]`（`zh-Hans.json:829`）；request-id 只在成功响应回写（`request-logging.middleware.ts:26,37-47`）；需错误边界穿透 request id，成本较高 |
| REL-21 | E2E 未接入 CI | release-infra lane（第 26 轮） | 26 | candidate | — | 第 29 轮复核：远端仍只有 `ci.yml`（workflow total_count=1）；`playwright.config.ts:22-29` 已为 CI 配好 retries/reporter/trace；Chromium 期望 1248（本机缓存 1234，需显式 `playwright install`）；建议独立 `e2e.yml`（PR + push main、临时 SQLite、失败 artifact 保留 3 天），**提交前必须本地跑通 `playwright install chromium` + `playwright test`**；新增后需同步 8 处发布文档断言。不要在本轮扩展 spec（REL-22） |
| REL-22 | E2E spec 覆盖小于 RC gate A | release-infra lane（第 26 轮） | 25 | candidate | — | `alert-flow.spec.ts:53-118` 无 Route、Destination preview/test、Delivery、过滤、失败 retry；关闭 `mvp-rc-checklist.md:125` 前需扩展 |
| REL-23 | main 无 required checks（ruleset） | release-infra lane（第 26 轮） | 24 | candidate | — | `gh api branches/main/protection` 404、rulesets 为空；workflow 只是建议门禁。需 EXPERT_PANEL（仓库设置属高风险外部变更） |
| REL-24 | Provider fixtures 缺失 | release-infra lane（第 26 轮） | 23 | candidate | — | 第 29 轮复核：仍无 `fixtures/` 目录；6 个 adapter 共 19 个代表性 payload、32 个用例（backlog 旧记「31 用例」已过期），另有 6 个非对象拒绝用例；`feishu/index.test.ts:15-16` 有 `with { type: "json" }` 先例；建议先搬 8 个最小 fixture |
| ARCH-27 | Provider catalog/`iconName` 无消费者，Source UI 硬编码 | architecture lane | 24 | candidate | — | `registry.ts:73-85` 已投影，但 `source-provider-icon.tsx:1-40` 按 provider 穷尽 switch、`source-form.tsx:57-67,149-158` 重复列表；缺 provider catalog procedure |
| ARCH-28 | Operations DTO 在 core 与 api 双份定义，无 parity 守卫 | architecture lane | 21 | candidate | — | 手写 interface（`packages/core/src/operations.ts:120,132`）与 zod schema（`packages/api/src/schemas/operations.ts:37,59,78,99,111`）各维护一份；无 `satisfies` 断言。第 21 轮实测已漂移：core `EventDetailDelivery`（`operations.ts:89-92`）无 `destinationKind`，API schema（`schemas/operations.ts:51-57`）有 |
| ARCH-29 | `configuration-support.ts` 成为跨能力 helper 集散地 | architecture lane | 21 | candidate | — | 同时导出 token 生成、测试事件、脱敏、配置解析与引用校验（`configuration-support.ts:11-125`），被 7 个能力服务导入 |
| ARCH-30 | `OperationsTable` 分页固定在本地 state | architecture lane | 21 | candidate | — | `operations-table.tsx:58-62` 不受控；配置列表刷新/后退回第 1 页（`sources-section.tsx:81` 等 5 处）；AGENTS 要求分页进 URL。第 18 轮 requirements lane 独立确认（评分 25），与 REQ-30 的前置关系成立 |
| ARCH-31 | 契约与 runtime 的 auth 错误文案双份维护 | architecture lane | 20 | candidate | — | `dashboard-auth.ts:5-15` 注释要求同步，`dashboard-session.ts` 另写一份；无 parity 测试 |
| ARCH-32 | Events/Deliveries 无自有 api/model 边界 | architecture lane | 19 | candidate | — | 两个 feature 只有 ui/ 或 model/，数据能力集中在 `features/operations`；20+ 跨 feature 引用（`OperationTimestamp`） |
| ARCH-33 | 两个新增死组件 | architecture lane | 19 | candidate | — | `form-text-field.tsx`、`destination-kind-badge.tsx` 全仓零 import；与 FIX-5/9/10 合并清理 |
| ARCH-34 | Scaffold 模板与 generic-webhook 能力分叉 | architecture lane | 19 | candidate | — | `scaffold/schema.ts:8-13` 仅 text 模板，`generic-webhook/schema.ts` 已支持 JSON 模板；README 声称不会漂移 |
| REQ-86 | 事件详情展示上游告警回链与接入元数据 | requirements lane | 28 | shipped | #149 | 「标准化」页新增「上游告警」区块；http(s) 白名单 + 去凭据 + `noopener noreferrer`；其余标量元数据带产品文案；PRD `docs/prd/event-upstream-source.md` |
| REQ-87 | 投递详情原始事件载荷与渲染载荷对照 | requirements lane | 28 | shipped | #153 | `DeliveryDetail.rawPayloadPruned` + 载荷页左右对照；复用 `isPrunedRawPayload`；PRD `docs/prd/delivery-payload-comparison.md` |
| REQ-88 | 事件列表显示上游发生时间与接入延迟 | requirements lane | 27 | candidate | — | 列表 DTO 只有 `receivedAt`（`schemas/operations.ts:37-49`），详情已有 `occurredAt`；需加 `occurredAt` 投影与负值/非法值兜底 |
| REQ-89 | 投递重试二次确认与重试次数上下文 | requirements lane | 27 | candidate | — | 列表/详情重试一次点击即发送（`delivery-actions.tsx:25-37`、`delivery-retry-button.tsx:27-31`）；复用 REQ-72 的确认模式，展示目标/路由/事件/尝试次数 |
| REQ-90 | 自托管运行指标 scrape 端点 | requirements lane | 27 | candidate | — | 仅有 `/api/health` 与 `/api/ready`（`health.ts:5-13`、`ready.ts:6-53`）；只读 `GET /api/metrics`，手写 OpenMetrics 文本，低基数、无新依赖、无迁移 |
| REQ-91 | 操作列表相对时间与数据新鲜度 | requirements lane | 26 | candidate | — | 全站绝对时间（`operation-format.ts:31-47`）；24h 内相对时间 + `time` 语义 + 工具栏 `dataUpdatedAt`；不做自动刷新（REQ-35） |
| REQ-92 | 配置表单未保存修改的离开护栏 | requirements lane | 25 | candidate | — | 四个配置对话框关闭时只检查 pending（`destination-edit-dialog.tsx:49-55` 等）；基于 TanStack Form dirty 统一确认，提交成功后不拦截 |
| REQ-93 | Settings 在线数据库快照下载 | requirements lane | 27 | candidate | — | 需 `SqliteStore` 窄备份能力 + 受 dashboard 鉴权的下载路由；快照含敏感配置，先过 EXPERT_PANEL；`backup-restore-upgrade.md:77-82`、`connection.ts:23-32` |
| REQ-94 | raw payload 保留策略后台收敛与手动执行 | requirements lane | 26 | candidate | — | 无 webhook 时 sweep 不触发；复用 `pruneAllRawPayloads` + maintenance runner；`intake.service.ts:179-190`、`intake.repository.ts:136-156` |
| REQ-95 | 模板编辑器非破坏性草稿语义 | requirements lane | 26 | candidate | — | 切模式自动注入 starter、来源切换强改 mode；空/非空 body 语义不可见；`destination-form.tsx:311-318,454-470`、`destination-form.ts:641-667` |
| REQ-96 | 路由重叠与重复投递风险预览 | requirements lane | 25 | candidate | — | 去重键含 `route_id`，同事件同目标不同路由会重复投递；只读分析；`delivery.helpers.ts:80-86`、`intake.service.ts:98-125` |
| REQ-97 | 告警源级默认标签 | requirements lane | 24 | candidate | — | 复用既有 `sources.config_json` 无迁移；payload 同名 label 优先；`source-form.ts:27-35`、`intake.service.ts:110-127` |
| REQ-98 | 投递历史显式 opt-in 清理 | requirements lane | 23 | candidate | — | 决策要求「预览 N 条再确认」形态；终态过滤 + 分批 + cascade；`history-retention-and-snapshots.md:14-23` |
| REQ-99 | Events/Deliveries 命名筛选视图 | requirements lane | 23 | candidate | — | localStorage 保存/应用/删除；复用 `DashboardOperationSearchSchema`；`events-page-toolbar.tsx:18-48` |
| REQ-100 | 搜索结果解释命中字段 | requirements lane（第 21 轮） | 25 | candidate | — | 按 message/ID 命中时行内看不出原因；`events-table.tsx:51-74`、`operations.ts:50-61`、`history.repository.ts:410-455`；需 DTO 增命中字段/摘要，列表与 total 同谓词 |
| REQ-101 | 时间显示标注当前时区 | requirements lane（第 21 轮） | 23 | candidate | — | 时间戳 title 与显示值相同，从不输出时区；`operation-timestamp.tsx:46-53`、`operation-format.ts:11-28`；纯展示，复用设置时区 |
| REQ-102 | pending 投递等待退避期间立即重试 | requirements lane（第 21 轮） | 26 | candidate | — | `retryNow` 仅接受 failed（`delivery.repository.ts:411-419`），修好目标后仍需等退避；置 `next_attempt_at=now`、不改 attempt_count；需 service 校验与二次确认 |
| REQ-103 | 生产 compose 默认安全启动 | requirements lane（第 22 轮） | 27 | candidate | — | 拒绝 compose 内置公开 `BETTER_AUTH_SECRET`（`docker-compose.yml:17`）并默认只绑本机（`:11`）；同步 smoke/E2E/部署文档；`auth-config.ts:3-4,78-79` 占位值黑名单不含默认值 |
| REQ-104 | 备份/恢复演练脚本与完整性校验 | requirements lane（第 22 轮） | 27 | candidate | — | 新增隔离 smoke：写数据 → 冷备份 → 恢复到新卷 → `/api/ready` + `integrity_check`；复用 REL-3 的 smoke override；`mvp-rc-checklist.md:217-219`、`backup-restore-upgrade.md:175-180` |
| REQ-105 | 静默规则中的失效引用可见且可移除 | requirements lane（第 22 轮） | 25 | candidate | — | 删除 Source/Destination 不清 suppression 引用（`source.service.ts:76-85`、`destination.service.ts:120-129`）；表单只渲染现存选项（`suppression-forms.tsx:498-545`）；建议并入 REQ-48 预检 |
| REQ-106 | 加急 ping 排队重试的显式取消 | requirements lane（第 22 轮） | 24 | candidate | — | pings 表无操作列（`delivery-pings-table.tsx:22-44`），contract 只有 `buzzDelivery`；是否复用 `suppressed` 状态需 EXPERT_PANEL；`oncall.repository.ts:216`、`schema.ts:216-217` |
| REQ-107 | 配置删除模型归档化 | requirements lane（第 22 轮） | 22 | candidate | — | deliveries/events 的 cascade 会抹掉历史证据（`schema.ts:65-66,116-119`）；`post-mvp-planning.md:49-61` 要求公开 release 前重评；需 PRD/ADR + forward-only `deleted_at` → EXPERT_PANEL |
| REQ-108 | Events/Deliveries 多值属性筛选 | requirements lane（第 24 轮） | 28 | candidate | — | `severity`/`status`/`deliveryState` 支持多值；URL 逗号分隔并兼容旧单值，chips 逐项移除，列表与 total 同谓词；`operation-search.ts:13-20`、`operation-filters.tsx:258-303,411-441`、`history.repository.ts:88-93,250-255`；无迁移/新依赖 |
| REQ-109 | 事件标签一键静默 | requirements lane（第 24 轮） | 29 | shipped | #172 | 标签旁图标按钮打开既有静默对话框，预填 source + `equals` 标签；新增 `suppressionDefaultsFromLabel`；PRD `docs/prd/event-label-silence.md`；纯前端 |
| REQ-110 | 静默即将到期提示 | requirements lane（第 24 轮） | 28 | candidate | — | Header 指示器只统计 active；扩展 `ActiveSuppressionSummary` 增加 30 分钟内到期数量并提示；`suppression-summary.ts:50-80`、`active-suppression-indicator.tsx:20-56`；可并入 REQ-39 评估 |
| NEW-A | 停用配置前的断流影响确认 | requirements lane（第 25 轮） | 29 | shipped | #187 | 三个行内启停按钮仅在「启用→停用」方向弹确认；告警源显示匹配的已启用路由数、目标显示引用它的已启用路由数、路由显示关联目标数；说明排队投递是继续还是暂停；PRD `docs/prd/disable-config-confirmation.md`；纯前端 |
| NEW-B | 静默窗口快捷时长 | requirements lane（第 25 轮） | 27 | candidate | — | 创建静默只有 `datetime-local`，默认固定 2 小时（`suppression-form.ts:118-128`、`suppression-forms.tsx:310-338`）；加 30m/1h/4h/24h 预设按钮，仍存绝对时间；纯前端 |
| NEW-C | 路由保存前的「目标全停用」警示 | requirements lane（第 25 轮） | 27 | candidate | — | 目标选择器不显示启停状态（`route-forms.tsx:987-1018`）；全停用时路由可保存但永不投递；列表已显示停用数（`routes-section.tsx:328-340`）；仅路由表单 + i18n |
| REQ-111 | 初始化 Owner 密码确认与不可恢复提示 | requirements lane（第 26 轮） | 27 | candidate | — | Setup 只有单个密码字段、成功后直接进 dashboard，且无重置入口（`-setup-form-impl.tsx:156-185,61-65`、`routes/setup.tsx:14`）；加确认密码 + 不可恢复说明，仅前端校验；纯前端 |
| REQ-112 | 事件列表投递计数一键下钻 | requirements lane（第 26 轮） | 26 | candidate | — | 计数徽标不可点击（`event-delivery-counts-cell.tsx:57-82`）；跳 `/deliveries?q=<eventId>&deliveryState=<state>`，复用现有谓词与筛选；零值/未匹配路由保持不可点 |
| REQ-113 | 复制当前筛选视图链接 | requirements lane（第 26 轮） | 26 | candidate | — | Events/Deliveries 工具栏只有刷新/重置（`events-page-toolbar.tsx:19-47`、`deliveries-page-toolbar.tsx:18-48`）；筛选与页码已在 URL；复制绝对 URL + toast；纯前端 |
| REQ-114 | 投递重试前预览当前渲染结果 | requirements lane（第 26 轮） | 25 | candidate | — | 重试按钮直接执行（`delivery-retry-button.tsx:23-56`）；复用 `destinations.preview({id, sampleEventId})` 与既有预览对话框；仅 failed 状态显示，明确「只预览不发送」 |
| REQ-115 | 首次部署空状态引导与过期文案修正 | requirements lane（第 26 轮） | 25 | candidate | — | Events 空态无下一步（`events-empty-state.tsx:12-26`）；Sources/Routes/Integrations 文案仍称「右侧栏」（`zh-Hans.json:913,796,636`）但页面无侧栏；补 CTA 并修正文案 |
| REQ-116 | Events/Deliveries 每页条数选择 | requirements lane（第 26 轮） | 25 | candidate | — | 固定 20 条（`events-table-layout.ts:3`、`operations.queries.ts:32-39`），契约允许 1–100（`packages/api/src/schemas/operations.ts:207`）；URL 增 `pageSize=20/50/100` 并重置页码 |
| REQ-117 | 路由/静默创建失败保留表单 | requirements lane（第 26 轮） | 23 | candidate | — | 两个对话框提交即关闭并重置（`route-add-dialog.tsx:75-78`、`suppression-add-dialog.tsx:74-77`），失败只弹 toast；对齐 Sources/Destinations 的等待成功语义 |
| REQ-118 | Provider adapter 贡献指南与 scaffold | requirements lane（第 26 轮） | 22 | candidate | — | 只有 destination 侧指南/`just new-destination`（`Justfile:71-72`、`docs/contributing/`）；RC checklist `:117` 与 post-MVP 方向 6 要求 provider 对齐 |
| SEC-7 | 归一化事件字段绕过 raw 脱敏并可传播到出站投递 | security lane | — | shipped | #180 | **第 25 轮 EXPERT_PANEL 裁决**：读取/发送边界投影，不改存储；第 27 轮落地 `redactNormalizedEvent` + `redactRouteMatchResults`（含 `checks[].actual`）+ `redactEventRecord`，用于事件/投递 DTO、补投预览、目标预览与发送输入；匹配/去重/回放仍读原值。决策 `docs/planning/decisions/credential-redaction-boundaries.md` |
| SEC-8 | 投递 attempt 响应体裸 token/URL 凭据可穿透 | security lane | — | shipped | #176 | 第 26 轮 PR A：`redactCredentialText` 覆盖认证 scheme（Bearer/Basic/Token，需值含数字或符号）、`xox[baprs]-`、URL userinfo、Slack/飞书/Lark webhook；组合进 `redactText` 与 `redactJsonValue`；读取层复核 attempt/delivery/oncall/列表旧行。修复 `max_tokens` 尾部误判。决策 `docs/planning/decisions/credential-redaction-boundaries.md`；PR B（SEC-7 + SEC-17）待做 |
| SEC-9 | 请求上下文 `headersRecord` 保留原始 Authorization/Cookie | security lane | 24 | candidate | — | 当前唯一消费者会再脱敏；建议构造时即 `redactHeaders`；`request-context.ts:87-97` |
| SEC-10 | 旧库存量行只在写入时脱敏，读取不复核 | security lane | — | shipped | #176 | `deliveryFromRow`/`attemptFromRow`/`oncallPingFromRow`/投递列表映射读取时幂等复核；不做历史回填。决策 `docs/planning/decisions/credential-redaction-boundaries.md` |
| DOC-34 | `route-authoring-current-state.md` 结论段仍称能力不存在 | docs-drift lane | 24 | candidate | — | 文首校正已存在，但 `:17,:105,:115` 仍称无本地化/无解释通道/无 route×destination；代码已反证 |
| DOC-35 | README/发布文档仍把 Docker smoke 未进 CI 当缺口 | docs-drift lane | 25 | shipped | #162 | README、release checklist、backup/upgrade 文档统一为「E2E 未接入 CI；Docker smoke 保留为本地人工 gate」 |
| DOC-36 | `next-round.md` 仍把已交付的 D2/D5 列为待做 | docs-drift lane | 23 | candidate | — | 变量面板分组/搜索/折叠与光标插入已落地；UX 评审缺状态头；`next-round.md:258-265` |
| DOC-37 | 抑制 PRD 两处「当前四个状态」过期 | docs-drift lane | 22 | candidate | — | 已五状态（含 `suppressed`）；`alert-suppression.md:43,338`；与 DOC-24 合并 |
| DOC-38 | `delivery-route-match-evidence.md` 已实现但无状态头 | docs-drift lane | 22 | candidate | — | 与 DOC-26 合并；`delivery-route-evidence.tsx` 已落地 |
| DOC-39 | RC 清单漏记 suppressed 与抑制/集成页面 | docs-drift lane | 22 | candidate | — | `mvp-rc-checklist.md:40,44-45` |
| DOC-40 | `destination-template-engine-issues.md` 未勾选项已交付 | docs-drift lane | 20 | candidate | — | Slack/Email/JSON 模式均已实现；`:138` |
| DOC-41 | post-MVP adapter 问题陈述覆盖已交付的 destination 侧 | docs-drift lane | 20 | candidate | — | 剩余缺口在 provider fixture/指南；`post-mvp-planning.md:178` |
| DOC-42 | 发布文档仍称没有 tag / 回滚镜像未发布 | release-infra + docs-drift lane（第 22 轮） | 25 | shipped | #162/#163 | tag、registry 约定、回滚镜像与当前版本已在发布文档中对齐 |
| DOC-43 | README 能力/结构清单过期 | docs-drift lane（第 22 轮） | 23 | candidate | — | 页面清单缺 Suppressions/Integrations（`README.md:34`）；仓储缺 feishu-app/oncall/suppression（`:36`）；仍写 server functions（`:55`） |
| DOC-44 | 投递搜索占位文案文档落后 | docs-drift lane（第 22 轮） | 20 | candidate | — | `delivery-search-fields.md:48-49` 未提外部消息引用；`zh-Hans.json:674` 已更新（REQ-66） |
| DOC-45 | README Roadmap 状态过期 | docs-drift lane（第 22 轮） | 24 | candidate | — | `README.md:197-204,228-230` 仍把已交付能力列为待完善；需逐条加状态而非整段删除 |
| DOC-46 | post-MVP 方向 5 仍整段列为候选 | docs-drift lane（第 27 轮） | 24 | candidate | — | `post-mvp-planning.md:156-174`；CI、Docker smoke、release 文档、脱敏日志均已落地，仅 E2E 未接 CI |
| DOC-47 | post-MVP 方向 2 缺口描述过期 | docs-drift lane（第 27 轮） | 23 | candidate | — | `post-mvp-planning.md:211-215` 称缺投递缺口解释，实际 `route-match-gaps.ts:57` 与 `history.repository.ts:194` 已实现；仅剩样例 Event 干跑预览 |
| DOC-48 | 四个已交付 mini-PRD 缺状态头 | docs-drift lane（第 27 轮） | 22 | candidate | — | `active-suppression-indicator.md`、`event-label-silence.md`、`delivery-payload-comparison.md`、`oncall-feishu-urgent.md` 仍用现在时称能力不存在 |
| DOC-49 | RC 清单概览漏列三类剩余 gate | docs-drift lane（第 27 轮） | 23 | candidate | — | `mvp-rc-checklist.md:17-21,104` 称只剩 E2E，但 dedupe cleanup、provider fixture、多版本 payload 仍未勾选 |
| DOC-50 | ADR 0008 / restructure-plan 版本与命令过期 | docs-drift lane（第 27 轮） | 22 | candidate | — | `adr/0008...:16,20` 写 vite-plus 1.0.0（实际 `pnpm-workspace.yaml:9` 1.3.0）；`console-server-restructure-plan.md:80` 的 `vp -C apps/console fmt:check` 不存在，`:49` 路径过期 |
| DOC-51 | frontend-architecture 页面/feature 清单不全 | docs-drift lane（第 27 轮） | 22 | candidate | — | `frontend-architecture.md:17-18,138-148` 缺 integrations、suppressions、auth 与 setup |
| DOC-52 | adapter-extensibility 剩余范围漏 F3 | docs-drift lane（第 27 轮） | 21 | candidate | — | F3 仍成立：表单只消费 template `modes`，其余 configFields 不参与渲染（`destination-form.ts:294`） |
| NEW-D | 顶栏全局 ID 快速查找 | requirements lane（第 27 轮） | 27 | candidate | — | 顶栏只有栏目名与静默指示器（`dashboard-header.tsx:30`）；粘贴事件/投递 ID 直达详情，复用 `operations.queries.ts:56`；纯 console shell + feature API |
| NEW-E | 通知目标只读配置详情 | requirements lane（第 27 轮） | 27 | candidate | — | DTO 已有 `urgentReceivers/headerNames/replyTo/appRef`（`destination.ts:26`），列表只显示数量（`destination-operational-config-cell.tsx:61`）；行内只读弹层，不碰 secret |
| NEW-F | 飞书应用删除/换密前影响面预检 | requirements lane（第 27 轮） | 27 | candidate | — | 删除确认只显示应用名（`feishu-app-actions.tsx:89`），引用目标已在 DTO；服务端删除时才拒绝（`feishu-app.service.ts:84`）；纯 feature UI |
| NEW-G | 事件/投递详情复制直达链接 | requirements lane（第 27 轮） | 26 | candidate | — | 详情只显示 ID（`page-toolbar.tsx:36`），动作无复制链接；复用 `copyText`，绝对 URL，纯前端 |
| NEW-H | 一键检测全部飞书应用凭证 | requirements lane（第 27 轮） | 25 | candidate | — | 工具栏只有新增/刷新（`feishu-apps-page.tsx:45`），测试只能逐行；顺序调用现有 `integrations.testFeishuApp`，汇总成功/失败 |
| NEW-1 | 静默命中列表显示告警身份 | requirements lane（第 23 轮） | 28 | shipped | #166 | 事件列增加 severity 徽标 + 标题（链接事件）+ 源·状态·ID；复用 `DeliveryListItem` 既有字段；PRD `docs/prd/suppression-hit-event-identity.md` |
| NEW-2 | Source 接入 URL 使用部署公开地址 | requirements lane（第 23 轮） | 25 | candidate | — | 复制出的 webhook URL 用浏览器 origin，SSH 隧道/反代下不可达（`source-webhook.ts:5-11`、`browser.ts:5-7`）；建议与 REQ-52 共用 `TOCSIN_PUBLIC_URL`，经 `i18n.getRequestLocale` 投影 |
| SEC-11 | 任意认证头名不被 `redactHeaders` 脱敏 | security lane（第 23 轮） | — | candidate | — | MEDIUM：`X-Custom-Auth`/`X-Auth`/`Authentication`/`X-Signature` 值原样落库并展示（`intake.service.ts:80`、`event-raw-tab.tsx:23-26`）；按值形态二次脱敏或 allowlist，parser 也消费同一份 headers → EXPERT_PANEL |
| SEC-12 | Destination endpoint URL 的 userinfo 密码进入客户端 DTO | security lane（第 23 轮） | — | candidate | — | LOW：`destination.helpers.ts:48-58,275-289`；`webhookurl` 已被定为 secret，但 endpoint 可见决策未覆盖 userinfo；建议投影时剥离 → EXPERT_PANEL |
| SEC-13 | `isSensitiveKey` 残留缺口 | security lane（第 23 轮） | — | candidate | — | LOW：`secretAccessKey`/`aws_secret_access_key`/`sessionKey`/`pwd`/`pass`/`dsn`；精确键加入，避免 `pass` 词尾规则误伤 `bypass` |
| SEC-14 | `request-context.ts` 缺 server-only 标记 | security lane（第 23 轮） | — | candidate | — | LOW：直接 import `@tanstack/react-start/server`；导入方均为 server middleware/route；需 build 验证 import protection |
| SEC-15 | 三份文档称响应体/错误「已脱敏」但仅键值脱敏 | security lane（第 23 轮） | — | shipped | #176 | 三处改为「敏感键 + 高置信值形态」，并写明无前缀裸 token / generic webhook path/query 不承诺覆盖 |
| SEC-16 | 读取层不复核存量脱敏 | security lane（第 23 轮） | — | shipped | #176 | 与 SEC-10 同一修复；`intake.helpers` 的 raw payload 读取路径按 SEC-18 在入库时已值形态脱敏 |
| SEC-17 | providerMetadata 入库/出站前无统一脱敏兜底 | security lane（第 25 轮） | 24 | shipped | #180 | 第 27 轮随 SEC-7 落地：`redactEventRecord` 在读取边界对 providerMetadata 走 `redactJsonValue`（key + 值形态），grafana/alertmanager `externalURL` 的 userinfo 被投影；存储仍为原文（决策已接受） |
| SEC-18 | raw payload 字符串叶子不做值形态扫描 | security lane（第 25 轮） | 22 | shipped | #176 | `redactJsonValue` 对字符串叶子应用 `redactCredentialText`；parser 仍读取原值，解析/匹配/去重语义不变 |
| UI-1 | 列表搜索吞字符与空格、逐键请求 | ui-review（第 23 轮，浏览器实测） | 29 | shipped | #171 | 本地草稿 + 300ms 防抖后才写 URL；`pruneSearch` 保留空格，仅服务端过滤 trim；清除 chip/重置会取消未提交草稿；同时闭环 REQ-78 |
| UI-2 | 筛选无匹配与无数据空态相同 | ui-review（第 23 轮，浏览器实测） | 27 | shipped | #184 | = REQ-4；`events-empty-state.tsx:12-26`、`deliveries-empty-state.tsx:12-26` 无条件渲染；传 `hasActiveFilters` + 内联重置 |
| UI-3 | Delivery Payload 标签名过期 | ui-review（第 23 轮） | 24 | candidate | — | 页面已左右对照，标签仍是「渲染 Payload」；`delivery-detail-view.tsx:34`、`zh-Hans.json:195` |
| UI-4 | 移动端 Sheet 无可见关闭按钮 | ui-review（第 23 轮） | 24 | candidate | — | `sidebar.tsx:206-231` 用 `[&>button]:hidden` 隐藏内置关闭；加显式 `SheetClose` |
| UI-5 | 折叠侧栏首屏闪动 | ui-review（第 23 轮） | 22 | candidate | — | `sidebar.tsx:80-98` cookie 在 mount 后恢复；宜在 loader/SSR 读 cookie 传 `defaultOpen` |
| UI-6 | 两个同名 Toggle sidebar 控件 | ui-review（第 23 轮，a11y） | 22 | candidate | — | `dashboard-header.tsx:17` 与 `sidebar.tsx:307-334`；给 Rail 加 `aria-hidden` |
| UI-7 | 空表仍渲染分页条 | ui-review（第 23 轮，浏览器实测） | 21 | shipped | #184 | `table-pagination.tsx:48-118`；`total === 0` 时隐藏 |
| UI-8 | 中文登录页混用英文 dashboard | ui-review（第 23 轮，浏览器实测） | 22 | candidate | — | `zh-Hans.json` 改为「控制台」；第 27 轮复现：`/setup`「创建 owner 账号／dashboard 用户」与 toast「正在打开 dashboard」同样混用（`zh-Hans.json:3,11,18,25,29`） |
| UI-9 | 静默时间时区错位 | ui-review（第 27 轮，浏览器实测） | 27 | candidate | — | 表单按浏览器本地时间输入、列表按设置默认 UTC 显示，差 8 小时且无时区标注，维护窗口可能错时生效；`suppression-forms.tsx:313-334`、`suppression-form.ts:119-126`、`operation-format.ts:15`；成本 45–60 分钟 |
| UI-10 | 移动端空态被横向卷出屏幕 | ui-review（第 27 轮，390px 实测） | 26 | shipped | #184 | 空态位于最小宽 1280px 的表格内，390px 下文字在视口外；`operations-table.tsx:111-145`、`deliveries-table-layout.ts:3`；与 UI-2/UI-7 同一空态切片 |
| UI-11 | 静默停用按钮显示原始 i18n key | ui-review（第 27 轮，浏览器实测） | 24 | candidate | — | aria-label/tooltip 直接显示 `suppressions.table.actions.disableTitle`；`suppressions-section.tsx:277`；成本 2 分钟 |
| UI-12 | 空态文案与实际交互不符 | ui-review（第 27 轮，浏览器实测） | 23 | candidate | — | Sources/Routes 称「右侧会保留新建表单」，实际「新增」打开对话框（`zh-Hans.json:915,798`）；轮换 Token 后仍提示「创建成功」；`source-token-notice-panel.tsx:35,53,70` |
| REQ-119 | 接入去重窗口可配置 | requirements lane（第 28 轮） | 27 | candidate | — | Settings 增去重窗口（1–60 分钟），intake 与补投共用；`intake.service.ts:56`、`event-replay.service.ts:35` 硬编码 5 分钟，`settings.repository.ts:20-26` 无此键 |
| REQ-120 | 投递最大尝试次数可配置 | requirements lane（第 28 轮） | 27 | candidate | — | Settings 增 1–10 次并入队传值；`delivery.repository.ts:90` 默认 3，`EnqueueDeliveriesInput.maxAttempts` 已存在（`delivery.interface.ts:81`）但无生产调用点传入 |
| REQ-121 | Source Token 轮换宽限期 | requirements lane（第 28 轮） | 24 | candidate | — | 轮换后旧 token 保留 0/15/60 分钟；`source.service.ts:66-73` 直接覆盖、`schema.ts:44` 单列、`zh-Hans.json:907` 承认切换期断流；需 forward-only 迁移 + EXPERT_PANEL |
| REQ-122 | 领域错误文案本地化 | requirements lane（第 28 轮） | 23 | candidate | — | 为高频 DomainValidationError 增稳定 code，前端 zh/en 映射；`domain-errors.ts:19-25`、`errors.ts:36-41`；toast 直接显示英文 `error.message`（`delivery-buzz-button.tsx:49`） |
| REQ-123 | 配置列表最近更新时间 | requirements lane（第 28 轮） | 25 | candidate | — | Source/Destination/Route 列表 DTO 投影 `updatedAt`；表已有列且仓储维护（`schema.ts:48,59,94`），DTO 未投影（`source.ts:13-18`、`destination.ts:64-66`、`route.ts:37-45`）；飞书应用列表已显示 |
| REQ-124 | 投递详情解释「加急为什么没有发生」 | requirements lane（第 29 轮） | 28 | candidate | — | 自动加急 5 个 gate 均静默 return（`oncall.service.ts:131-160`）；pings 空时只有泛化文案（`delivery-pings-table.tsx:48-54`）；`destinationMetadata` 缺 `urgentAutoEnabled/urgentSeverities`（`destination.helpers.ts:180-193`）。只读投影 + 纯函数 reason code + 说明区，无迁移/无发送语义变化 |
| REQ-125 | 告警源额外共享密钥显式清除 | requirements lane（第 29 轮） | 27 | candidate | — | 编辑留空=保留，无清除路径（`source-form.ts:27-35`、`source.service.ts:52-64`）；AGENTS 要求 preserve/replace/clear；加 `clearSigningSecret` 命令位与表单二次确认，无迁移 |
| REQ-126 | 飞书应用凭证变更前验证 | requirements lane（第 29 轮） | 26 | candidate | — | 保存直接覆盖 app_id/secret（`feishu-app.service.ts:72-82`）；现有 test 只接受已存 id 并读旧 secret（`:102-118`）；新增 draft 凭证验证过程（不写库）+ 保存前确认 |
| REQ-127 | 加急呼叫新鲜度上限 | requirements lane（第 29 轮） | 26 | candidate | — | scheduled ping 无年龄上限（`oncall.repository.ts:57-81,133-153`）；目标停用/worker 停机后恢复会补拨旧告警；有界过期收敛为 `failed`，不新增状态/迁移 |
| REQ-128 | 手动加急披露去重跳过 | requirements lane（第 29 轮） | 26 | candidate | — | 被 dedupe 的接收人返回 `null` 且不计数（`oncall.service.ts:89-109`、`oncall.repository.ts:43-53`）；toast 只报新建数（`delivery-buzz-button.tsx:42-46`）；DTO 增 `skippedReceivers` |
| Q-40 | 语言解析顺序与注释/文案不一致 | requirements lane（第 28 轮） | 24 | candidate | — | `i18n/router.ts:9-13` 称 cookie→Accept-Language→settings，`:21` 却把 settings 当 cookieLocale 传入，Accept-Language 不可达；通知渲染用 `settings.locale`（`delivery-worker.service.ts:64`、`destination.service.ts:296`） |
| Q-41 | 配置名 UNIQUE 冲突返回不透明 500 | requirements lane（第 28 轮） | 22 | candidate | — | `schema.ts:42,55,88,101` 有 UNIQUE，服务无预检、`errors.ts:24-57` 未映射 SQLite 约束错误且剥离 message（`:12`），重名创建只得到 INTERNAL_SERVER_ERROR |
| ARCH-35 | client-only 标记过度使用 | architecture lane（第 28 轮） | 16 | candidate | — | `components/ui/dropdown-menu.tsx:1`、`routes/-login-form-impl.tsx:1`、`routes/-setup-form-impl.tsx:1`、`i18n/language-switcher-impl.tsx:1`、`shell/dashboard-user-menu-impl.tsx:1` 自身无浏览器 API；建议并入 ARCH-14 |

## 发布记录

| 版本 | tag 指向 | 镜像 | 说明 |
|---|---|---|---|
| `0.1.0-beta.16` | `2d4247b` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.16`（linux/amd64 + linux/arm64，digest `sha256:9788b4b8…`） | 运维列表空态区分「无数据/筛选无匹配」并支持内联重置、空表隐藏分页条、移动端空态移入视口（#184，UI-2 + UI-7 + UI-10）；删除无引用的 operations-panel/detail-panel；无迁移/配置变化；回滚镜像 `0.1.0-beta.15` |
| `0.1.0-beta.15` | `9871a5a` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.15`（linux/amd64 + linux/arm64，digest `sha256:a63d5cb9…`） | 事件/投递读取与发送边界凭据脱敏投影（#180，SEC-7 + SEC-17）；脱敏标签禁用静默、投递路由证据诚实降级；无迁移/配置变化；回滚镜像 `0.1.0-beta.14` |
| `0.1.0-beta.14` | `ed700d7` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.14`（linux/amd64 + linux/arm64，digest `sha256:3fcdfd18…`） | 包含凭据形态脱敏与旧行读取复核（#176）及 `.dockerignore` E2E 产物排除（#177）；无迁移/配置变化；回滚镜像 `0.1.0-beta.13`（digest `sha256:3501c616…`） |
| `0.1.0-beta.13` | `9232200` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.13`（linux/amd64 + linux/arm64，digest `sha256:3501c616…`） | 包含事件标签一键静默（#172）与运维搜索草稿/防抖修复（#171）；无迁移/配置变化；回滚镜像 `0.1.0-beta.12`（digest `sha256:552e3590…`） |
| `0.1.0-beta.12` | `1725ac7` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.12`（linux/amd64 + linux/arm64，digest `sha256:552e3590…`） | 包含抑制命中列表告警身份（#166）与加急呼叫持久化失败终态修复（#168）；无迁移/配置变化；回滚镜像 `0.1.0-beta.11`（digest `sha256:2c338841…`） |
| `0.1.0-beta.11` | `3295013` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.11`（linux/amd64 + linux/arm64，digest `sha256:2c338841…`） | 包含 dashboard 静默状态指示器；Docker smoke 与生产卷隔离；ACR buildx provenance 修复；无迁移/配置变化；回滚镜像 `0.1.0-beta.10`（digest `sha256:6acac322…`） |
| `0.1.0-beta.10` | `6bbef05` | `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:0.1.0-beta.10`（linux/amd64 + linux/arm64，digest `sha256:6acac322…`） | 包含可折叠侧边栏、外部消息引用搜索、侧边栏状态持久化修复；无迁移/配置变化；回滚镜像 `0.1.0-beta.9`（已在 ACR，digest `sha256:b861d9cf…`） |

## 下一轮优先项

0. **REQ-124（28）** 投递详情解释「加急为什么没有发生」：第 29 轮 requirements 首推，
   纯只读投影 + 纯函数 reason code，无迁移；其次 **REQ-125（27）** 告警源共享密钥显式清除。
1. **UI 小成本批次**：UI-9（27）静默时间时区错位；UI-4（移动端 Sheet 关闭按钮）、
   UI-11（停用按钮原始 i18n key，2 分钟）、UI-12（空态文案与实际交互不符）、
   UI-8（登录/初始化页混用 dashboard）；UI-5/UI-6 视情况。
2. **NEW-A（29）** 停用 Source/Route/Destination 前的断流影响确认；
   **REQ-111（27）** 初始化 Owner 密码确认与不可恢复提示。
   **REQ-119/120（27）** 去重窗口与最大尝试次数可配置；仍待裁决：REQ-93、Q-8、REQ-107。
3. **REQ-108（28）** 多值属性筛选、**REQ-73（28）** 静默时区语义、
   **REQ-48（28）** 配置删除预检（并入 REQ-105）、**REQ-52（28）** `tocsin.eventUrl`
   与公开地址、**REQ-110（28）** 静默即将到期提示。
4. **REQ-112/113/114/115/116（25-26）**：投递计数下钻、复制视图链接、重试前预览、
   首次部署空态与过期文案、每页条数；**NEW-B/NEW-C（27）**。
5. **REL-21（26）**：新增独立 `e2e.yml`（先本地跑通 `playwright install chromium` +
   `playwright test`，DB 预清理，失败 artifact）；**REL-24（23）** 搬 8 个 provider fixture；
   **REL-23（24）** required checks 交 EXPERT_PANEL。
6. **SEC-9 + SEC-13 + SEC-14 + Q-32 + Q-26 + Q-38**：`headersRecord` 拆窄字段、
   `isSensitiveKey` 精确键、`request-context` server-only 标记、`toLowerCase` 归一化、
   抑制窗口时间比较、复制失败 toast。
7. **docs-drift 批次**：DOC-34/11/22/23/24/25/26/27/36/37/38/39/40/41/43/44/45，拆两个
   `docs:` PR；第 22 轮已刷新证据。
8. **车道轮转（第 30 轮）**：`requirements` 必跑 + `ui-triage`；第 29 轮已完成
   `requirements` + `release-infra` + `ui-triage`（defer），`docs-drift` 顺延到第 30 轮。
   REL-21 若要实施：先本地 `playwright install chromium` + `playwright test` 跑通，
   再新增 `e2e.yml` 并同步 8 处发布文档断言；未跑通不得合并。
9. **REQ-88/89/90（27）**：事件接入延迟、重试确认、指标端点。
10. **REQ-81/67/54/55（27）**：告警源一键静默、事件列表三分支计数、源覆盖区分停用路由、
    事件摘要计入已抑制。
11. **REQ-32/22/24/12/13（28）与 REQ-83/84/91/92（25-26）**：既有高价值切片与补投
    抑制预览、Settings 版本、相对时间、表单离开护栏。
12. **REQ-94/95/96/97/98/99（23-26）**：保留策略、模板草稿语义、路由重叠预览、源级默认
    标签、显式历史清理、命名筛选视图。
13. **Q-25/Q-23/Q-31/33/34/35/Q-36/Q-37/Q-39**：小型质量项；Q-23/Q-37 的有界
    cleanup 一起设计。
14. **ARCH-27/28/29/30 + ARCH-13/14 + FIX-8/5/9/10**：provider catalog、DTO parity、
    helper 拆分、分页 URL 化与低风险 chore。
15. **REL-6/7/5/16/18/19/22 + REL-13**：Docker smoke 断言、E2E harness、readiness、
    CI 门禁；LICENSE 保持 blocked-autonomous。
16. **REQ-49/25/33/34/35/36/39/40/41/82/71/74..79/85**：其余候选按评分与依赖续做。

## 已知过期输入

- `docs/planning/next-round.md` 的基线是 `2f48153`，且其 §1.1 结论
  （`config-portability.ts` 非穷尽 switch）已由 `a460a6f` 修复。续做该备忘前先按
  当前 `origin/main` 复核；落后提交数会持续变化，以
  `git rev-list --count 2f48153..origin/main` 为准，不要引用固定数字。
