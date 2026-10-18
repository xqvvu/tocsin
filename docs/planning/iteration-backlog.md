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
| REQ-13 | 告警源接入自检 dry-run | requirements lane | 28 | candidate | — | provider manifest `testPayload` 无消费者；`source-actions.tsx:21-163`、`packages/api/src/contract/sources.ts:24-45` |
| REQ-14 | Raw/debug JSON 搜索与折叠 | requirements lane | 27 | candidate | — | `event-json-block.tsx:14-47`、`delivery-json-block.tsx:14-47`；post-MVP 方向 4 `:133` |
| REQ-15 | 存储容量与历史增长信号 | requirements lane | 26 | candidate | — | 只读 PRAGMA/COUNT；`settings.ts:5-9`、`operational-summary.tsx:30-58` |
| REQ-16 | Event 详情一键按 fingerprint 静默 | requirements lane | 28 | shipped | #116 | 工具栏「静默此指纹」对话框；复用创建表单预填 source+fingerprint；PRD `docs/prd/event-fingerprint-silence.md` |
| REQ-17 | 加急呼叫失败的全局可观测与再呼叫 | requirements lane | 27 | candidate | — | 投递成功但电话全失败时无信号；`oncall-execution.ts:136-159`、`delivery-execution.ts:104-118`；需只读投影 |
| REQ-18 | 按当前失败筛选批量重试投递 | requirements lane | 27 | candidate | — | 复用 `retryNow` 语义；需确认框 + 硬上限 200；`delivery.repository.ts:411-440` |
| REQ-19 | Events/Deliveries 按标签键值过滤 | requirements lane | 26 | candidate | — | `json_each(labels_json)` 精确匹配；建议 REQ-5 合入后再做（同文件） |
| FIX-2 | 搜索框承诺指纹但只搜 title/message | 代码核实 | 29 | shipped | #110 | 与 FIX-3 同一 PR；统一 `title/message/fingerprint` 谓词，列表与 total 共用 |
| FIX-3 | 搜索未转义 LIKE 通配符 | 质量 lane | 27 | shipped | #110 | 转义 `%` `_` `\` 并使用 `ESCAPE '\'`；新增 `search.test.ts` |
| FIX-4 | 删除不存在的 Source/Destination/Route 返回成功 | 质量 lane | 26 | candidate | — | contract 已声明 NOT_FOUND；与 suppression 行为不一致 |
| FIX-5 | `operations-panel.tsx`/`detail-panel.tsx` 为死代码 | 架构 lane | 24 | candidate | — | 无任何 importer；删除可减少筛选面板歧义。同时删除 `OperationFilters` 只剩测试可达的 `rail`/`grid` 分支（`operation-filters.tsx:58,64-77`） |
| FIX-6 | 导入配置不识别字面量 `[REDACTED]`，可能覆盖真实凭据 | SEC-1 panel | 27 | shipped | #114 | 四个凭据位置拒绝占位符，事务回滚；`config-portability.ts` 新增 `assertNotRedactedSecret` / `assertNoRedactedSecrets` |
| FIX-7 | Sources 页中文仍把 Source 译作「来源」 | requirements lane | 23 | candidate | — | `zh-Hans.json:545`；AGENTS.md 要求「告警源」 |
| FIX-8 | 抑制的 `createdBy` 永远为空 | requirements lane | 26 | candidate | — | `suppression.service.ts:53-71` 未接收当前用户；详情页显示「未知」`suppression-detail-page.tsx:95-97` |
| SEC-1 | `isSensitiveKey` 漏掉 `appSecret/clientSecret/apiSecret/privateKey/X-Auth-Token` | 安全 lane | — | shipped | #107 | EXPERT_PANEL 一致：归一化键名 + 词尾规则；决策 `docs/planning/decisions/secret-redaction-coverage.md` |
| SEC-2 | 脱敏回归测试按 registry 而非 `DestinationKindSchema.options` | 安全 lane | 25 | candidate | — | 现有 `it.each(registeredDestinationKinds)` 已覆盖四个 kind；补一条枚举一致性断言 |
| SEC-3 | `env.ts` 直接读 `process.env` 但无 server-only 标记 | 安全 lane | 24 | candidate | — | 无 client importer；可加标记或修订 AGENTS.md 例外 |
| SEC-4 | Feishu app test 错误消息未过 `redactText` | 安全 lane | 24 | candidate | — | 防御性加固，与 destination.test 保持一致 |
| Q-1 | 出站 HTTP 无超时，单个挂起目标会卡住单进程 worker | 质量 lane | — | shipped | #108 | EXPERT_PANEL 一致：共享层 10s deadline，`timeout`/可重试；决策 `docs/planning/decisions/outbound-http-timeout.md` |
| Q-2 | 出站响应体无上限 | 质量 lane | 26 | candidate | — | 与 inbound 的 body limit 对齐 |
| Q-3 | Provider `*Result` 函数对非对象 payload 直接 throw | 质量 lane | 25 | candidate | — | 边界契约不一致 |
| Q-4 | Destination service NOT_FOUND 分支无测试 | 质量 lane | 26 | candidate | — | 实测 6 个分支：update/delete/getTemplateDraft/test/preview/previewUpdate + sampleEventId；`configuration.integration.test.ts` 无 missing-id 用例 |
| Q-5 | History repository 查询覆盖薄 | 质量 lane | 27 | candidate | — | sourceId、组合筛选、越界页均无测试；损坏 `route_matches_json` 会让整页抛错（`history.repository.ts:385-393`） |
| Q-6 | 超时 `errorKind` 未持久化，Deliveries 只显示英文 `lastError` | Q-1 panel | 24 | candidate | — | `delivery-execution.ts:134-141`；需 forward-only 加列 + UI 文案映射 |
| Q-7 | 同批投递串行发送，慢投递仍造成队头阻塞 | Q-1 panel | 20 | candidate | — | `delivery-worker.service.ts:75-77`；超时已缓解，并发化需单独设计 |
| Q-8 | `markSucceeded` 抛错会被当作发送失败并重试，导致重复发送/重复 page | quality lane | 26 | candidate | — | `delivery-execution.ts:72` 的 try 覆盖 93-102；`delivery-execution.test.ts:292-317` 无持久化失败注入 |
| Q-9 | 同批 attempt 共用 run 开始时间，`finishedAt == startedAt`，退避可能已过期 | quality lane | 24 | shipped | #128 | `DeliveryExecution.execute` 增加实时时钟，`markSucceeded/markFailed` 持久化真实 `startedAt`；耗时列不再恒为 0 |
| Q-10 | claim 后单条 execute 抛错会中断整批，剩余投递滞留 `running` | quality lane | 24 | candidate | — | `delivery-worker.service.ts:55-77,85-93`；无 post-claim 部分失败测试 |
| Q-11 | `resolveDestinationConfig` 两条错误分支无测试 | quality lane | 24 | shipped | #119 | 两条 fake resolver 用例：配置错误最终失败、未知错误脱敏 |
| Q-12 | `testDestination` 失败分支的脱敏 DTO 无测试 | quality lane | 24 | candidate | — | `destination.service.ts:187-194`；现有 fetch 永远 `ok: true` |
| Q-13 | worker 脱敏测试未注入 secret，只依赖驱动错误文本 | quality lane | 20 | candidate | — | `delivery-worker.service.test.ts:840-854`；应注入带 secret 的 fake store 错误 |
| REL-1 | CI 未接入 E2E | RC checklist A | 24 | candidate | — | `ci.yml:16-51` 仅 quality job；`vite.config.ts:51` 排除 `e2e/**`；全仓无 `playwright install`；`playwright.config.ts:7-9` 注释误称已有 workflow。**token 已有 `workflow` scope（2026-10-18 核实），阻碍是 gate 设计与 spec 覆盖，不是权限** |
| REL-2 | Provider payload fixture 目录 | RC checklist E | 27 | candidate | — | 6 个 adapter 测试文件、19 个内联 payload、31 个用例；`packages/providers/src/` 无 fixture 目录 |
| REL-3 | Docker smoke 使用全局卷名，`down -v` 会删正常数据卷 | 发布 lane | 28 | candidate | — | `docker-compose.yml:7,32-37` 固定镜像 `tocsin:local` + 全局卷名 `tocsin-data`；`docker-smoke.sh:16-17,29,37` 固定项目名/端口并复用同一 compose 文件。正常栈运行时 smoke 会共享真实卷（双 worker）并覆盖镜像 tag；应加 `docker-compose.smoke.yml` override。10-18 release lane 复核仍成立，且 `down -v` 先于抓日志，失败时日志必丢；curl 无超时 |
| REL-4 | E2E spec 覆盖面不足 | 发布 lane | 25 | candidate | — | 单个串行用例只覆盖 setup/source/destination/webhook/events；未创建 Route、未验证 Delivery/retry/filter/重启/导出（`alert-flow.spec.ts:27`） |
| REL-5 | build 产物启动与文件型 SQLite migration 无 CI smoke | 发布 lane | 24 | candidate | — | CI 只 `vp run -r build`；`.output/server/index.mjs` 仅 Dockerfile/手动 smoke 执行。10-18 建议先加 `scripts/artifact-smoke.sh`：临时目录 + 临时 SQLite + 固定 secret，启动产物轮询 `/api/ready`，断言 checks 全 ok 并清理 |
| ARCH-1 | `route-forms.tsx` 965 行含两个导出组件 | 架构 lane | 25 | candidate | — | 拆 `create-route-form.tsx` / `edit-route-form.tsx` |
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
| DOC-11 | `adapter-contribution-experience.md` 的「不存在」盘点部分过期 | docs drift | 24 | candidate | — | F4/F6/F7/F8、S0 已有落地；需状态注记 |
| DOC-12 | `route-authoring-current-state.md` 去重证据断言过期 | docs drift | 23 | shipped | #127 | 拆成「去重已落库」与「skipExisting 仅计数」两行（`delivery_dedupe_keys`，`schema.ts:164-185`） |
| REQ-25 | 抑制规则试跑预览（dry-run） | requirements lane | 27 | candidate | — | PRD 承诺 `preview` 与范围预览，代码只有 list/get/hits；复用 `evaluateSuppressionMatch` + `listRecent`；`alert-suppression.md:97,209,238` |
| REQ-26 | Destination 用真实历史 Event 预览 | requirements lane | 29 | shipped | #122 | 预览对话框新增样例来源选择器（内置 + 最近 20 条历史 Event），三个预览入口均可重放；`recentEventsQueryOptions`、`destination-notices.tsx`、`destinations-page.tsx`；PRD `docs/prd/destination-historical-event-preview.md` |
| REQ-27 | Deliveries 列表显示告警身份 | requirements lane | 28 | candidate | — | 只显示 source + eventId；join 已有 events；`delivery-event-cell.tsx:1-18`、`history.repository.ts:218-237` |
| REQ-28 | 投递历史目标/路由名称快照 | requirements lane | 21 | candidate | — | 需 forward-only 0004 迁移；`history-retention-and-snapshots.md:47-83` |
| REQ-29 | 抑制规则保留期清理 | requirements lane | 24 | candidate | — | PRD 故事 28 未实现；设置项 + 有界 prune；`alert-suppression.md:105,224,237` |
| REQ-30 | 配置页搜索与过滤 | requirements lane | 25 | candidate | — | Sources/Routes/Destinations 三页只有新增/刷新；可复用 Events/Deliveries 筛选形态 |
| REL-6 | Docker smoke 断言弱于 checklist | release-infra lane | 26 | candidate | — | `test -f` 无法区分命名卷/匿名卷；`curl -f` 不校验 HTML；无 restart 持久化验证（`docker-smoke.sh:91-98`）；10-18 复核补：清理前先 `down -v` 导致失败日志丢失，三处 curl 均无 `--connect-timeout/--max-time` |
| REL-7 | E2E harness 就绪探针与隔离 | release-infra lane | 26 | candidate | — | 等 `/api/health` 而非 `/api/ready`；固定端口/DB 路径；globalSetup 默认值重复；未固定 locale（`playwright.config.ts:11,34,48`、`global-setup.ts:14-21`）。10-18 复核补：Playwright 先启动 webServer 再跑 globalSetup，删库发生在服务已打开并迁移之后；host 使用 `127.0.0.1` 违反 AGENTS 的 localhost 规则 |
| REL-8 | 生产构建 + 真实操作链路无门禁 | release-infra lane | 23 | candidate | — | E2E 跑 `vp dev`，smoke 只验 health；建议先加 `artifact-smoke.sh`，CI 形态需 EXPERT_PANEL |
| REL-9 | migration 仅 `:memory:` 覆盖，无文件库/WAL/校验和测试 | release-infra lane | 25 | candidate | — | `migrate.test.ts` 全部内存库；WAL 仅文件库（`connection.ts:29-31`）；runner 无 checksum |
| REL-10 | 备份恢复 runbook 存在 stale WAL 风险 | release-infra lane | 25 | candidate | — | 快照无伴生文件时未删除旧 `-wal`/`-shm`（`backup-restore-upgrade.md:92-99`） |
| REL-11 | `.github/**` 被排除在 fmt/lint 外且无 actionlint | release-infra lane | 22 | candidate | — | `vite.config.ts:10,28,63` |
| REL-12 | 发布文档 Node 版本过期 | release-infra lane | 24 | shipped | #127 | `docker-production-deployment.md:28` 已改为 `26.12.0` |
| REL-13 | 公开仓库缺少 LICENSE 与 package `license` 字段 | release-infra lane | — | blocked-autonomous | — | PUBLIC 仓库、`licenseInfo: null`；属法律/产品决策，需专家小组，不可自动代选 |
| REL-14 | 发布卫生项（task cache / 供应链 / 构建上下文） | release-infra lane | 20 | candidate | — | Vite Task 缓存未持久化；node-gyp/actions 未固定；`.dockerignore` 未排除 `.output`；低优先 |
| ARCH-10 | `destination-form.tsx` 单体 1390 行 | architecture lane | 23 | candidate | — | `destination-form.tsx:82-1292`；适配器/模板/预览内联；建议与模板编辑器改造一起拆 |
| ARCH-11 | 抑制表单未使用 TanStack Form | architecture lane | 24 | candidate | — | `suppression-forms.tsx:193-236` 仍为 `useState` + 手写校验，违反 AGENTS 表单约定 |
| ARCH-12 | `hashSourceToken` 放在 intake service 并被跨服务导入 | architecture lane | 22 | candidate | — | `intake.service.ts:329-331`、`source.service.ts:18`、`config-portability.service.ts:33`；建议移到窄模块 |
| FIX-9 | `server/runtime/store.ts` 为死代码 | architecture lane | 24 | candidate | — | 无生产 importer，唯一引用是自身测试；`application-container.md:50` 仍声称存在 |
| FIX-10 | 未使用的生产依赖 | architecture lane | 20 | candidate | — | `@faker-js/faker`、`@tanstack/match-sorter-utils` 全仓无 import；确认后移除或降为 devDependency |
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
| REQ-47 | 投递详情展示外部消息引用 | requirements lane | 29 | candidate | — | DTO 已返回 `providerReference` 且标注非 secret（`packages/api/src/schemas/operations.ts:115-117`），详情页未渲染；纯前端 + 复制 |
| REQ-48 | 配置删除影响预检 | requirements lane | 28 | candidate | — | 删除确认只有静态文案（`source-actions.tsx:143-146`、`destination-actions.tsx:132-137`、`routes-section.tsx:249-252`）；需只读 preview procedure 并模拟引用清理 |
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

## 下一轮优先项

1. **REQ-47**（29）：投递详情展示外部消息引用；DTO 已有、纯前端，可与加急记录联动。
2. **REL-3**（28，P0）：Docker smoke 卷/镜像/项目/端口隔离；第 11 轮 release lane 补充了
   `down -v` 丢日志与无超时证据，属任何 smoke CI 接入前的阻断项。
3. **REQ-48**（28）：配置删除影响预检；只读 preview procedure，需模拟引用清理语义。
4. **REQ-27**（28）：Deliveries 列表显示告警标题/严重程度/状态；纯 DTO 投影 + UI。
5. **REQ-32**（28）：解析失败事件的诊断可见性；解析失败审计已落库，缺投影与展示。
6. **REQ-22**（28）/ **REQ-24**（28）/ **REQ-12**（28）/ **REQ-13**（28）：既有高价值切片。
7. **补跑 requirements + docs-drift 车道**：第 11 轮两条车道 35 分钟无输出被停止，
   下一轮优先拿到新的需求候选与文档漂移清单。
8. **REL-6 + REL-7**（26/26）：Docker smoke 断言/日志/超时增强；E2E harness 改为
   ready 探针、动态临时库、`localhost`、固定 locale，并修正 globalSetup 删库顺序。
9. **REL-5**（24）：先加 `scripts/artifact-smoke.sh`，再决定是否进 CI。
10. **REQ-49**（27）：可移植配置覆盖抑制规则；schema + portability service + 导入确认。
11. **REQ-25**（27）：抑制规则试跑预览；只读 procedure + 复用 core matcher，注意与 FIX-8 一起做。
12. **REQ-33/REQ-34/REQ-35/REQ-36**（27）：绝对时间窗口、CSV 导出、列表自动刷新、事件标签可见性。
13. **REQ-39/REQ-40/REQ-41**（27/26/26）：静默续期、详情返回保筛选、告警源接入指引。
14. **Q-14..Q-19 + Q-12/Q-13 + Q-4/Q-5**：纯测试补齐，可合并一个 `test:` PR；
    Q-16 需重写为真正渲染两个列表的 parity 断言。
15. **ARCH-13 + ARCH-14 + FIX-8**：显式 env 注入、冗余标记清理、抑制 `createdBy`。
16. **FIX-5 + FIX-9 + FIX-10**：低风险 chore（死代码、死分支、未用依赖），可合并一个 PR。
17. **REL-1/REL-4**（24/25）：E2E 接入 CI 前先扩 spec 覆盖（第 8 轮已确认最小 CI 方案：
    setup vp → playwright install chromium → `CI=true playwright test`，无新服务/secret；
    第 11 轮补充：失败时上传 `test-results`/`playwright-report` artifact）；
    **REL-13**（LICENSE）保持 blocked-autonomous，需专家小组做法律/产品决策。
    ARCH-10/ARCH-11 等再次触碰对应文件时做。

## 已知过期输入

- `docs/planning/next-round.md` 的基线是 `7b5d501`，且其 §1.1 结论（`config-portability.ts` 非穷尽
  switch）已由 `a460a6f` 修复。续做该备忘前先按当前 `origin/main` 复核。
