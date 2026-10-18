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
| REQ-5 | Deliveries 按路由过滤 + 筛选面板按页面能力渲染 | post-MVP 方向 4 | 28 | candidate | — | 同时修掉 Events 页 destination/delivery-state 静默 no-op |
| REQ-2 | Suppression 列表按派生状态筛选与搜索 | 运维摩擦 | 27 | candidate | — | 纯客户端过滤，复用 `suppressionStateAt` |
| REQ-3 | Route 样例 Event 干跑预览 | post-MVP 方向 2 | 27 | candidate | — | 必须复用 core matcher；不写 events/deliveries |
| REQ-6 | Fingerprint 聚合排障视图 | post-MVP 方向 4 | 27 | candidate | — | 只读聚合 + 精确下钻；注意 GROUP BY 成本 |
| REQ-4 | 过滤态空状态与一键重置 | 运维摩擦 | 26 | candidate | — | 区分「无数据」与「筛选无匹配」 |
| REQ-7 | 停用目标造成投递静默滞留 | requirements lane | 29 | candidate | — | `delivery.repository.ts:219-226` vs `:97-168`；DTO 已有 `enabled`，UI 未展示 |
| REQ-8 | Deliveries 按最后活动过滤与排序 | requirements lane | 28 | candidate | — | 列表按 `created_at`（`history.repository.ts:240,269-271`），表格展示 `updated_at` |
| REQ-9 | 告警源最近接收时间 | requirements lane | 27 | candidate | — | `SourceSummary` 无时间字段；聚合 `MAX(events.received_at)` |
| REQ-10 | Event/Delivery 详情互链 | requirements lane | 27 | candidate | — | 三个入口目前是纯文本：投递详情、事件投递表、投递列表事件列 |
| REQ-11 | Worker/队列健康只读投影 | requirements lane | 25 | candidate | — | health 仅出现在手动 `runDeliveryWorker` 响应；RC checklist `:160` 声称已有 |
| FIX-2 | 搜索框承诺指纹但只搜 title/message | 代码核实 | 29 | candidate | — | `zh-Hans.json:616` vs `history.repository.ts:95-100,265-270,310-315,363-368` |
| FIX-3 | 搜索未转义 LIKE 通配符 | 质量 lane | 27 | candidate | — | `q:"%"` 匹配全部；`q:"cpu_high"` 匹配 `cpu-high` |
| FIX-4 | 删除不存在的 Source/Destination/Route 返回成功 | 质量 lane | 26 | candidate | — | contract 已声明 NOT_FOUND；与 suppression 行为不一致 |
| FIX-5 | `operations-panel.tsx`/`detail-panel.tsx` 为死代码 | 架构 lane | 24 | candidate | — | 无任何 importer；删除可减少筛选面板歧义 |
| FIX-6 | 导入配置不识别字面量 `[REDACTED]`，可能覆盖真实凭据 | SEC-1 panel | 27 | candidate | — | `config-portability.service.ts:171-190`；建议拒绝并提示改用 `secret_refs`，事务回滚 |
| FIX-7 | Sources 页中文仍把 Source 译作「来源」 | requirements lane | 23 | candidate | — | `zh-Hans.json:545`；AGENTS.md 要求「告警源」 |
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
| REL-1 | CI 未接入 E2E / Docker smoke | RC checklist A | 24 | candidate | — | `gh` token 已具备 workflow scope；下一轮交 EXPERT_PANEL 裁决；E2E spec 覆盖面也小于 checklist 要求 |
| REL-2 | Provider payload fixture 目录 | RC checklist E | 27 | candidate | — | 测试内联 payload 抽成 fixture，行为不变 |
| REL-3 | Docker smoke 使用全局卷名，`down -v` 会删正常数据卷 | 发布 lane | 24 | candidate | — | 改按 project 命名或加注释 |
| ARCH-1 | `route-forms.tsx` 965 行含两个导出组件 | 架构 lane | 25 | candidate | — | 拆 `create-route-form.tsx` / `edit-route-form.tsx` |
| ARCH-2 | `suppression-forms.tsx` 699 行含两个导出组件 | 架构 lane | 25 | candidate | — | 同上 |
| ARCH-3 | `delivery-state-badge.tsx` 三个导出组件 | 架构 lane | 23 | candidate | — | 低优先级 |
| ARCH-4 | `system-information.ts` 五层相对路径导入根 `package.json` | 架构 lane | 23 | candidate | — | 走配置别名或单点 server adapter |
| DOC-1 | RC checklist 断言「抑制没有 UI 入口」 | docs drift | 27 | candidate | — | `docs/release/mvp-rc-checklist.md:55-56`；实际 service/router/UI 全在 |
| DOC-2 | 4 处 `xqvvu/vane` 仓库链接过期 | docs drift | 25 | candidate | — | ADR 0010、RC checklist、两份模板 PRD |
| DOC-3 | 模板表单「只支持 Feishu 模式」等三处限制已过期 | docs drift | 26 | candidate | — | manifest 驱动模式选择器、Email 字段均已落地 |
| DOC-4 | `next-round.md` 基线 `7b5d501` 过期，S0 已修复 | docs drift | 25 | candidate | — | 更新基线；标注 `a460a6f` 已修复；A/B/D2/D3/F3/F4/F7 也已在当前代码落地 |
| DOC-5 | 迁移计划仍写「只有 0001 baseline」 | docs drift | 25 | candidate | — | 已有 `0002_suppressions`、`0003_complete_legacy_schema` |
| DOC-6 | 架构文档文件树漂移（`migrate.ts`、`auth/router.ts`、缺 suppressions） | docs drift | 24 | candidate | — | `sqlite-store.md`、`application-container.md`、`frontend-architecture.md` |
| DOC-7 | 抑制 PRD/决策文档状态仍写「草案/待拍板」 | docs drift | 24 | candidate | — | E1–E3 已落地 |
| DOC-8 | README/AGENTS.md 的 pnpm 版本过期 | docs drift | 23 | candidate | — | `package.json` 现为 `pnpm@12.14.0`（本轮依赖升级后） |

## 下一轮优先项

1. **REQ-7**（29）：停用目标/路由造成的投递静默滞留，在路由列表与投递详情给出派生警示；
   纯前端复用现有 DTO，单轮可交付。
2. **FIX-2 + FIX-3**（29/27）：搜索框承诺指纹却只搜 title/message，且 LIKE 通配符未转义。
   两者同属「搜索兑现承诺」，可作为一个小的修复 PR；与 REQ-1 共享 `history.repository.ts`。
3. **REQ-8**（28）或 **REQ-5**（28）：Deliveries 按最后活动过滤/排序，或按路由过滤 +
   筛选面板按页面能力渲染。两者都改 `history.repository.ts` / 筛选面板，二选一即可。
4. **DOC-1 / DOC-2 / DOC-3 / DOC-4 / DOC-5**：一批高价值文档更正，可合并为一个 `docs:` PR。
5. **FIX-6**（27）：导入配置拒绝字面量 `[REDACTED]`，避免覆盖真实凭据。
6. **REL-1**（24）：下一轮交 EXPERT_PANEL 裁决，把 E2E / Docker smoke 接入 CI；
   实现前先在本地跑通。

## 已知过期输入

- `docs/planning/next-round.md` 的基线是 `7b5d501`，且其 §1.1 结论（`config-portability.ts` 非穷尽
  switch）已由 `a460a6f` 修复。续做该备忘前先按当前 `origin/main` 复核。
