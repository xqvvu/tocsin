# REQ-274 控制台会话可见性与撤销：专家小组裁决

- 日期：2026-10-27（第 123 轮）
- 事项：backlog `REQ-274`（评分 28）——控制台「安全」面：活跃会话列表与单会话撤销
- 裁决方式：3 位专家独立评估（安全与可靠性、产品与运维、评估者），不共享结论

## 结论（采纳方案）

**做，但只做最小可逆切片，且下一轮实施**：在既有 Settings 内新增「账号安全」面板，
只提供**当前账号自己的**会话只读列表 + 一个「退出其他设备」动作。

- 服务端**不得**调用 Better Auth 的 `api.listSessions`，改用新建的 SQLite 仓储直接查询
  `session` 表（显式列投影，排除 `token`）；撤销其他会话调用
  `auth.api.revokeOtherSessions({ headers })`，服务端代持凭据、不外发 token。
- 不做逐行「撤销指定会话」，不做「撤销当前会话后跳登录」（现有 Sign out 已覆盖）。
- 不做最近登录记录 / 失败审计（`session` 行登出即删，没有审计表，做了就是假数据）。
- 无 schema 变更、无迁移、无新依赖；回滚只需 revert 代码。

## 三位专家意见

### 1. 安全与可靠性专家

- **授权边界必须是 self-only。** 实例当前只能存在一个 dashboard 账号
  （`apps/console/src/lib/auth-owner-bootstrap.ts:21-29`，`container.ts:614-621`；
  `/setup` 在 `setupRequired === false` 时重定向，`routes/setup.tsx:40-45`）。
  跨用户会话操作在单用户产品里是休眠的账号接管 / 锁定原语，多用户一落地就会静默生效。
- **禁止代理 `auth.api.listSessions`**：其返回包含 `session.token`
  （`better-auth@1.7.12` `dist/db/schema.d.mts:50`、`dist/api/routes/session.mjs:365`），
  且被 `freshSessionMiddleware` 包住，默认 `freshAge` 24h
  （`dist/context/create-context.mjs:149`、`session.mjs:331-346`），登录超过一天的运维打开页面会
  直接 `SESSION_NOT_FRESH`。
- 逐行撤销若实现，必须由服务端按 `(id, user_id)` 解析行、代持 token 调
  `auth.api.revokeSession({ body: { token } })`；跨用户 id 一律 `RecordNotFoundError` → 404，
  不制造存在性预言机。
- 最坏情况：token 泄漏等于发放可用 bearer cookie，可改路由 / 目标并持续到会话过期（默认 7 天）。
  代码级可回滚，但已泄漏的会话在过期或撤销前仍有效。
- 可逆性：**可逆（仅代码 revert）**；被撤销的会话不会因回滚复活。

### 2. 产品与运维专家

- MVP 对认证的全部承诺是「简单 owner/admin 登录」
  （`docs/prd/self-hosted-alert-hub-mvp.md:113,179,180`），会话管理不在 RC gate
  （`docs/release/mvp-rc-checklist.md:9-15,55-69,193-210`）。
- 今天只有一个 dashboard 账号，且没有改密 / 邮件重置
  （`apps/console/src/lib/auth-options.ts:67-70`）。「退出其他设备」是**事故响应开关**
  （丢电脑、共用 owner 密码、成员离职），不是日常面板，触发频率极低。
- 反代部署下 IP/UA 可信度存疑（`docs/release/docker-production-deployment.md:23,114`），
  页面必须把未知 IP 显示为「未知」，不得回落到 `127.0.0.1` 冒充真实地址。
- 价值排序：REQ-58（等待重试 vs 重试耗尽）> REQ-267（投递名称快照）> SEC-30（签名族脱敏）
  > REQ-32（解析失败可见性）> REQ-274。
- 最小切片：只读列表 + 「退出其他设备」；不做逐行撤销，不新增顶级导航。
- 可逆性：**高**；唯一不可逆动作是删除 `session` 行，与现有 Sign out 语义相同。

### 3. 评估者

- **可在单个窄 PR 内实现**，前提是走新的 SQLite 仓储而不是 Better Auth 的
  `listSessions`；若走 BA API，必须拆 PR 并先解决 fresh-session 门槛，否则不可交付。
- 集成点：Settings 现有路由 `routes/_dashboard.settings.tsx:13`、tab 定义
  `features/configuration/ui/use-settings-workspace.ts:5`、面板组合
  `settings-page.tsx:20-38`；契约 `packages/api/src/contract/session.ts` + `schemas/auth.ts`；
  implementer `server/orpc/features/session/router.ts:26`；service
  `server/security/*.service.ts`；仓储 `infra/sqlite/repositories/session/`（接入
  `infra/sqlite/store.ts:56-67`）。
- 表已存在，无迁移（`infra/sqlite/schema.ts:219-228`、`migrate/better-auth.schema.ts:21`）。
- 测试计划：仓储（跨用户删除影响 0 行、过期过滤、投影不含 `token`）、service
  （`RecordNotFoundError`、DTO 无 token 键）、oRPC 清单与未认证 401
  （`server/orpc/server-orpc-auth.test.ts:80,154,230,238`）、UI jsdom（只读列表、撤销后失效查询）、
  i18n 键对齐（`apps/console/src/i18n/messages.test.ts:8`）。
- 最大风险：BA `list-sessions` 的 24h fresh 门槛；缓解是绕开它，**不要**设置
  `session.freshAge: 0`——同一设置会关闭改邮箱 / 删账号的密码复核，属安全回归。
- 验收需含负向授权：A 撤销 B 的会话 id 得到 `NOT_FOUND` 且 B 的行仍在。

## 分歧与最终选择

三位专家在「值得做」上一致（安全、评估），在产品优先级上有分歧（产品专家主张先做
REQ-58 / SEC-30 / REQ-267）。按「有分歧选最保守且可逆的方案」：

- 采纳产品专家的**最小切片**（只读列表 + 退出其他设备），放弃逐行撤销与撤销当前会话；
- 采纳安全与评估专家的**实现约束**（直接查 SQLite、显式列投影、self-only、跨用户 404）；
- 本轮已有 1 个需求切片（UI-73/74/75），按单轮预算规则不叠加第二个切片，
  REQ-274 状态改为 `planned`，下一轮实施。

## 回滚方式

1. revert 对应 PR（删除 Settings 面板、procedure、service、repository 与 i18n 键）。
2. `vp check && vp run -r test`，重新构建并部署上一镜像。
3. 无数据库迁移需要回退；已被撤销的会话保持撤销，重新登录即可。
