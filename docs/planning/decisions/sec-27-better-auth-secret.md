# SEC-27：生产模式接受仓库公开的 `BETTER_AUTH_SECRET` 默认值

- 日期：2026-10-22
- 类型：EXPERT_PANEL（安全 / 部署契约）
- 结论：**实施**，采用「compose 不提供可用默认值 + 应用启动 fail-fast + 历史公开值黑名单」方案。
- 决策记录：本文。

## 问题

`docker-compose.yml` 以 `NODE_ENV=production` 启动，并将 `BETTER_AUTH_SECRET` 写成
`${BETTER_AUTH_SECRET:-70c18d50…}`（仓库公开的 64 位 hex）。`apps/console/.env.example:2`
另有一个同样可用的公开 secret。`apps/console/src/lib/auth-config.ts` 的占位值黑名单只包含
Better Auth 自带默认值与 `change-me-…`，不包含这两个值。

此外，secret 校验是懒执行的：`server.ts` 的 bootstrap 只打开 SQLite，
`requireBetterAuthSecret` 在第一次 auth 请求（`container.getAuth()`）才运行。因此缺失 secret
时 `/api/ready` 仍可能返回 200，直到登录才 500。

## 三位专家意见

### 1. 安全与可靠性专家

- 推荐：compose 去掉可用默认值，改为 `${BETTER_AUTH_SECRET:-}`（或占位值）；在
  `server.ts` 的 `bootstrap()` 内、打开 store 之前显式调用 `requireBetterAuthSecret`；
  黑名单补两个历史值并做大小写/空白归一化。
- 反对 `${BETTER_AUTH_SECRET:?required}`：本机实测（Docker Compose v5.6.0）缺变量时
  `config`、`ps`、`logs`、`stop`、`start` 都会失败，事故响应时可能连容器都停不了。
- 严重性澄清：当前 session 是 DB-backed（无 cookieCache/OAuth/2FA trusted device），
  仅凭公开 secret 不能凭空伪造有效会话；但它是签名/加密密钥，一旦启用上述能力即成为直接认证绕过。
- 可逆性：无 migration，回滚即换回镜像；secret 轮换后旧 session 不可恢复（需重新登录）。

### 2. 产品与运维专家

- 推荐：完整方案——compose fail-fast、应用启动期校验、黑名单、文档、`.gitignore` 加根 `.env`。
- 认可 `${:?}` 的运维副作用（所有 compose 子命令都需要变量），若团队反对，备选 B 为
  `${:-}` + 应用启动期断言：`up -d` 会成功但容器随后退出并在 `restart: unless-stopped`
  下重启，错误在 `docker compose logs` 可见。
- 强调：不要提供显式 opt-out（允许公开 secret）；不要首次启动自动生成并持久化到 `/data`
  （把签名密钥变成数据卷状态，破坏备份/恢复与审计）。
- 符合 Product charter：单进程、SQLite-first、自托管、无新依赖、不改变 auth 核心语义；
  唯一代价是部署契约变化（缺 secret 拒绝启动），预发布阶段可接受。

### 3. 独立评估者

- 独立复现：`docker compose config` 在未设置变量时 exit 0 并解析出公开默认值；
  直接调用 `requireBetterAuthSecret` 时两个公开值均被接受。
- 推荐：完整方案（compose `${:?}` + 黑名单 + 启动断言 + 单测/契约测试 + 文档），
  但要求文档覆盖 `docker compose` 所有子命令；否则退化为「只实施黑名单子集」。
- 验收：单测覆盖两个历史值/大小写/空白；契约测试断言 compose 无可用 fallback、
  `.env.example` 值在 production 被拒绝；`vp check` / `vp run -r test` / `vp run -r build`。
- 明确：不要把 smoke/e2e 的一次性测试 secret 加入黑名单，否则 `just docker-smoke` 会红。

## 最终选择与理由

采用**最保守且可逆**的组合：

1. `docker-compose.yml` 的 fallback 改为公开占位值
   `change-me-to-at-least-32-characters`（不再提供可用密钥），保留 compose 的
   `config`/`ps`/`logs`/`down` 在未导出 secret 时仍可用。
2. `server.ts` 的 `bootstrap()` 在打开 SQLite 之前调用 `requireBetterAuthSecret`，
   让 production 缺 secret / 占位值时启动即失败，避免 `/api/ready` 假绿；覆盖
   compose、`docker run`、K8s 等所有部署方式。
3. `auth-config.ts` 黑名单加入两个历史公开值，并做 `trim().toLowerCase()` 归一化。
4. `apps/console/.env.example` 改用占位值；根 `.env` 加入 `.gitignore`。
5. 单测 + 新增 `deployment-secrets.contract.test.ts` 防止未来重新写死 secret。
6. README、部署、升级/回滚、RC checklist 同步；发布说明要求存量实例轮换 secret。

未采用 `${BETTER_AUTH_SECRET:?}`：安全专家实测它会同时破坏 `ps/logs/down`，比「容器启动失败」
更大的运维代价；启动期断言已经能在所有部署路径上实现 fail-fast。

## 回滚

- 代码回滚：`git revert` 本 PR；无 schema/数据变化。
- 部分回滚：把 compose fallback 改为 `${BETTER_AUTH_SECRET:-}`（空）或占位值，保留启动断言。
- **不要**回滚到历史公开默认值；那会重新引入漏洞。
- 已轮换 secret 的实例：旧 session 全部失效，用户重新登录即可，无需恢复数据库。
