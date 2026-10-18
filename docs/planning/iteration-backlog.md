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
| REQ-7 | 停用目标造成投递静默滞留 | requirements lane | 29 | shipped | #111 | 投递详情滞留警示 + 路由列表停用目标徽标；`DeliveryRetentionNotice`；PRD `docs/prd/delivery-retention-notice.md` |
| REQ-8 | Deliveries 按最后活动过滤与排序 | requirements lane | 28 | candidate | — | 列表按 `created_at`（`history.repository.ts:240,269-271`），表格展示 `updated_at` |
| REQ-9 | 告警源最近接收时间 | requirements lane | 27 | candidate | — | `SourceSummary` 无时间字段；聚合 `MAX(events.received_at)` |
| REQ-10 | Event/Delivery 详情互链 | requirements lane | 27 | candidate | — | 三个入口目前是纯文本：投递详情、事件投递表、投递列表事件列 |
| REQ-11 | Worker/队列健康只读投影 | requirements lane | 25 | candidate | — | health 仅出现在手动 `runDeliveryWorker` 响应；RC checklist `:160` 声称已有 |
| REQ-12 | Destination 列表最近投递健康 | requirements lane | 28 | candidate | — | 需新 summary DTO；`destination.ts:64-66`、`destinations-section.tsx:56-104`；AGENTS.md 要求先有 DTO |
| REQ-13 | 告警源接入自检 dry-run | requirements lane | 28 | candidate | — | provider manifest `testPayload` 无消费者；`source-actions.tsx:21-163`、`packages/api/src/contract/sources.ts:24-45` |
| REQ-14 | Raw/debug JSON 搜索与折叠 | requirements lane | 27 | candidate | — | `event-json-block.tsx:14-47`、`delivery-json-block.tsx:14-47`；post-MVP 方向 4 `:133` |
| REQ-15 | 存储容量与历史增长信号 | requirements lane | 26 | candidate | — | 只读 PRAGMA/COUNT；`settings.ts:5-9`、`operational-summary.tsx:30-58` |
| REQ-16 | Event 详情一键按 fingerprint 静默 | requirements lane | 28 | candidate | — | 纯前端切片；复用抑制表单预填 source+fingerprint；`event-detail-page.tsx:49-59`、`suppression-forms.tsx:67-100` |
| REQ-17 | 加急呼叫失败的全局可观测与再呼叫 | requirements lane | 27 | candidate | — | 投递成功但电话全失败时无信号；`oncall-execution.ts:136-159`、`delivery-execution.ts:104-118`；需只读投影 |
| REQ-18 | 按当前失败筛选批量重试投递 | requirements lane | 27 | candidate | — | 复用 `retryNow` 语义；需确认框 + 硬上限 200；`delivery.repository.ts:411-440` |
| REQ-19 | Events/Deliveries 按标签键值过滤 | requirements lane | 26 | candidate | — | `json_each(labels_json)` 精确匹配；建议 REQ-5 合入后再做（同文件） |
| FIX-2 | 搜索框承诺指纹但只搜 title/message | 代码核实 | 29 | shipped | #110 | 与 FIX-3 同一 PR；统一 `title/message/fingerprint` 谓词，列表与 total 共用 |
| FIX-3 | 搜索未转义 LIKE 通配符 | 质量 lane | 27 | shipped | #110 | 转义 `%` `_` `\` 并使用 `ESCAPE '\'`；新增 `search.test.ts` |
| FIX-4 | 删除不存在的 Source/Destination/Route 返回成功 | 质量 lane | 26 | candidate | — | contract 已声明 NOT_FOUND；与 suppression 行为不一致 |
| FIX-5 | `operations-panel.tsx`/`detail-panel.tsx` 为死代码 | 架构 lane | 24 | candidate | — | 无任何 importer；删除可减少筛选面板歧义 |
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
| Q-4 | Destination service NOT_FOUND 分支无测试 | 质量 lane | 26 | candidate | — | 五个方法缺少 missing-id 用例 |
| Q-5 | History repository 查询覆盖薄 | 质量 lane | 27 | candidate | — | sourceId、组合筛选、越界页、损坏 `route_matches_json` |
| Q-6 | 超时 `errorKind` 未持久化，Deliveries 只显示英文 `lastError` | Q-1 panel | 24 | candidate | — | `delivery-execution.ts:134-141`；需 forward-only 加列 + UI 文案映射 |
| Q-7 | 同批投递串行发送，慢投递仍造成队头阻塞 | Q-1 panel | 20 | candidate | — | `delivery-worker.service.ts:75-77`；超时已缓解，并发化需单独设计 |
| REL-1 | CI 未接入 E2E | RC checklist A | 24 | candidate | — | `ci.yml:16-51` 仅 quality job；`vite.config.ts:51` 排除 `e2e/**`；`Justfile:77-84` 仅本地；全仓无 `playwright install`；`playwright.config.ts:7-9` 注释误称已有 workflow |
| REL-2 | Provider payload fixture 目录 | RC checklist E | 27 | candidate | — | 6 个 adapter 测试文件、19 个内联 payload、31 个用例；`packages/providers/src/` 无 fixture 目录 |
| REL-3 | Docker smoke 使用全局卷名，`down -v` 会删正常数据卷 | 发布 lane | 27 | candidate | — | `docker-compose.yml:32-37` 显式 `name: tocsin-data`；`docker-smoke.sh:16,36-37` `down -v` 会删真实卷；应加 compose override |
| REL-4 | E2E spec 覆盖面不足 | 发布 lane | 25 | candidate | — | 单个串行用例只覆盖 setup/source/destination/webhook/events；未创建 Route、未验证 Delivery/retry/filter/重启/导出（`alert-flow.spec.ts:27`） |
| REL-5 | build 产物启动与文件型 SQLite migration 无 CI smoke | 发布 lane | 24 | candidate | — | CI 只 `vp run -r build`；`.output/server/index.mjs` 仅 Dockerfile/手动 smoke 执行 |
| ARCH-1 | `route-forms.tsx` 965 行含两个导出组件 | 架构 lane | 25 | candidate | — | 拆 `create-route-form.tsx` / `edit-route-form.tsx` |
| ARCH-2 | `suppression-forms.tsx` 699 行含两个导出组件 | 架构 lane | 25 | candidate | — | 同上 |
| ARCH-3 | `delivery-state-badge.tsx` 三个导出组件 | 架构 lane | 23 | candidate | — | 低优先级 |
| ARCH-4 | `system-information.ts` 五层相对路径导入根 `package.json` | 架构 lane | 23 | candidate | — | 走配置别名或单点 server adapter |
| ARCH-5 | service 直接构造并抛 `RecordNotFoundError` | architecture lane | 24 | candidate | — | `destination.service.ts:35,138,158,202,250,374`、`oncall.service.ts:7,59,73`；仓库已有 `requireDestination` |
| ARCH-6 | `/api/ready` 入口直接访问 SQLite store | architecture lane | 24 | candidate | — | `routes/api/ready.ts:10,19,22,26`；入口过厚，缺 readiness service |
| ARCH-7 | routes/suppressions section 内联 cell/actions/empty state | architecture lane | 23 | candidate | — | `routes-section.tsx:161,273,286,319,341`、`suppressions-section.tsx:173,194,200,247,260,363` |
| ARCH-8 | public i18n router 内联 locale 业务逻辑 | architecture lane | 22 | candidate | — | `server/orpc/features/i18n/router.ts:13-25`；缺 request-locale service |
| ARCH-9 | `locale-cookie.ts` 直接用浏览器 API 且被 server router 导入 | architecture lane | 23 | candidate | — | `locale-cookie.ts:29-35,37-47`；拆 `.client` 实现，neutral 部分保留 |
| DOC-1 | RC checklist 断言「抑制没有 UI 入口」 | docs drift | 27 | candidate | — | `docs/release/mvp-rc-checklist.md:55-56`；实际 service/router/UI 全在 |
| DOC-2 | 4 处 `xqvvu/vane` 仓库链接过期 | docs drift | 25 | candidate | — | ADR 0010、RC checklist、两份模板 PRD |
| DOC-3 | 模板表单「只支持 Feishu 模式」等三处限制已过期 | docs drift | 26 | candidate | — | manifest 驱动模式选择器、Email 字段均已落地 |
| DOC-4 | `next-round.md` 基线 `7b5d501` 过期，S0 已修复 | docs drift | 25 | candidate | — | 更新基线；标注 `a460a6f` 已修复；A/B/D2/D3/F3/F4/F7 也已在当前代码落地 |
| DOC-5 | 迁移计划仍写「只有 0001 baseline」 | docs drift | 25 | candidate | — | 已有 `0002_suppressions`、`0003_complete_legacy_schema` |
| DOC-6 | 架构文档文件树漂移（`migrate.ts`、`auth/router.ts`、缺 suppressions） | docs drift | 24 | candidate | — | `sqlite-store.md`、`application-container.md`、`frontend-architecture.md` |
| DOC-7 | 抑制 PRD/决策文档状态仍写「草案/待拍板」 | docs drift | 24 | candidate | — | E1–E3 已落地 |
| DOC-8 | README/AGENTS.md 的 pnpm 版本过期 | docs drift | 23 | candidate | — | `package.json` 现为 `pnpm@12.14.0`（本轮依赖升级后） |
| DOC-9 | 发布文档声称没有 E2E/smoke、迁移只有 0001 | release-infra lane | 27 | candidate | — | `release-checklist.md:22,58-60,97,106-107`、`backup-restore-upgrade.md:27,32,37,179`、`mvp-rc-checklist.md:100-102,189-190,211-212`；实际有 E2E/smoke 与 0001-0003 |
| DOC-10 | `route-explain-delivery-gap.md` 仍称「待实现」 | requirements lane | 24 | candidate | — | `docs/prd/route-explain-delivery-gap.md:3`；实现已落地 `event-detail-route-gaps.tsx:27-103` |

## 下一轮优先项

1. **REQ-16**（28）：Event 详情一键按 fingerprint 静默；纯前端切片，复用现有抑制表单与
   claim-time 抑制校验，风险最低。
2. **REQ-8**（28）：Deliveries 按最后活动过滤/排序；与已合入的 `routeId` 同改
   `history.repository.ts`，可复用本轮筛选面板。
3. **REQ-12**（28）/ **REQ-13**（28）：Destination 最近投递健康，或 Source 接入自检 dry-run；
   两者都需要一个新 summary/service 边界，二选一。
4. **REL-3**（27）：Docker smoke 卷隔离。风险高于普通修复（会误删真实数据卷），
   应在任何「Docker smoke 接入 CI」之前完成；需本地 Docker 实测。
5. **DOC-9**（27）+ **DOC-1/2/3/4/5/10**：一批高价值文档更正，可合并为一个 `docs:` PR。
6. **FIX-8**（26）：抑制 `createdBy` 永远为空。
7. **REL-1/REL-4**（24/25）：E2E 接入 CI 前先扩 spec 覆盖（Route / Delivery / retry / filter）。
8. **quality lane**：第 4 轮 quality 车道未在时限内返回（连续第 2 轮），下一轮优先补跑，
   或把车道拆成更小的只读任务（单包/单目录）以避免超时。

## 已知过期输入

- `docs/planning/next-round.md` 的基线是 `7b5d501`，且其 §1.1 结论（`config-portability.ts` 非穷尽
  switch）已由 `a460a6f` 修复。续做该备忘前先按当前 `origin/main` 复核。
