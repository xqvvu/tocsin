# 账号安全：登录会话可见性与「退出其他设备」

REQ-274（第 124 轮，决策见 `docs/planning/decisions/req-274-session-surface.md`）

## 问题

控制台只有一个 dashboard 账号，凭证就是邮箱加密码，没有改密和邮件重置
（`apps/console/src/lib/auth-options.ts`）。丢电脑、共用 owner 密码、成员离职时，操作者没有任何
入口确认「这个账号现在有几个登录会话、分别来自哪里」，也没有办法一次性让其他设备失效。

Better Auth 已经把会话写进 SQLite 的 `session` 表（`id` / `ip_address` / `user_agent` /
`expires_at`，见 `apps/console/src/infra/sqlite/schema.ts` 的 `BetterAuthSessionTable`），但控制台
从未读取它。

不能直接调用 Better Auth 的 `listSessions`：它返回 `session.token`，并被 24 小时
`freshSessionMiddleware` 包住，登录超过一天的运维打开页面会得到 `SESSION_NOT_FRESH`。也不能用
把 `freshAge` 设为 0 的办法绕过，那会同时关闭改邮箱、删账号的密码复核，属于安全回归。

## 用户故事

作为值班 SRE，在怀疑账号凭据外泄时，我希望在设置页看到当前账号的登录会话列表（客户端、IP、
最近活动、有效期），并能一键退出其他设备，而不影响我正在使用的这个会话。

## 范围

- 设置页「UI」标签下新增只读「账号安全」面板：
  - 会话列表：客户端（User-Agent）、IP、最近活动、有效期、状态（当前会话 / 其他会话）。
  - 未知 IP 与未知客户端显示为「未知」，不回落到 `127.0.0.1` 等伪造值。
  - 一个「退出其他设备」动作，打开确认对话框后调用服务端。
- 新增 oRPC 私有 procedure：
  - `session.listActiveSessions`：返回当前账号未过期会话的显式投影。
  - `session.revokeOtherSessions`：调用 `auth.api.revokeOtherSessions({ headers })`。
- 新增 SQLite 仓储 `infra/sqlite/repositories/session/`，显式列投影，**永不读取 `token`**。
- 新增 service `server/security/session-security.service.ts`，接 `store.sessions` 与窄接口
  `SessionRevoker`。
- Settings 工作区的刷新按钮与配置导入会一并刷新该投影（注册进
  `configurationReadOnlyQueryKeys`）。

## 非目标

- 不做逐行「撤销指定会话」：服务端不接受任何 session id，避免跨账号操作面。
- 不做「撤销当前会话后跳登录」：现有 Sign out 已覆盖。
- 不做最近登录记录 / 失败审计：`session` 行登出即删，没有审计表，做了就是假数据。
- 不新增 schema、迁移、依赖；不改变投递 / 路由 / auth 的核心语义。
- 不新增顶级导航或独立路由，面板放在既有 Settings 内。

## 验收标准

1. 已登录操作者打开设置页能看到自己的会话列表；当前会话有「当前会话」标记。
2. 列表不包含 `token` 字段（仓储测试断言投影键集合）。
3. 过期会话与其他用户的会话不出现在列表中（仓储测试）。
4. 没有其他会话时「退出其他设备」按钮禁用；点击后先出现确认对话框。
5. 确认后调用 `revokeOtherSessions`，成功提示「已退出其他设备」，失败提示错误且不冒充成功。
6. 服务端只接受当前会话身份：procedure 无输入参数，service 从已验证的 dashboard session 取
   `userId`，撤销走请求 cookie。
7. 未认证调用两个新 procedure 返回 `UNAUTHORIZED`（oRPC 清单测试）。
8. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 契约在 `packages/api`（`contract/session.ts` + `schemas/auth.ts`），实现分别在
  `server/orpc/features/session/router.ts`、`server/security/`、`infra/sqlite/repositories/session/`。
- 隐私边界：会话 id、IP、User-Agent 属于已认证操作者可运营的字段；token 与 hash 留在服务端。
- 回滚：revert 代码即可，被撤销的会话保持撤销，重新登录即可恢复；无数据库迁移需要退回。
