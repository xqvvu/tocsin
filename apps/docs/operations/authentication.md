---
title: 认证与账号安全
description: Tocsin 首次 owner 初始化、dashboard 登录、会话审计、密钥轮换与账号故障排查。
---

# 认证与账号安全

Tocsin 的 dashboard 使用 Better Auth 的邮箱与密码登录。它是单工作区的自托管控制台，不是带邀请、租户或用户目录的 SaaS 产品。

Dashboard 认证和 Webhook 接入是两条独立边界：

| 入口 | 凭证 | 适用范围 |
| --- | --- | --- |
| Dashboard `/login` | 邮箱、密码与服务端签发的 session cookie | 配置和查看告警源、路由、通知目标、事件与投递 |
| Webhook `/api/sources/<source-id>/webhook` | 告警源接入 Token 或该源配置的额外共享密钥 | 上游告警系统提交载荷，不使用浏览器 session |

不要用 owner 的 dashboard 密码代替告警源 Token，也不要把 Webhook 凭证当作 dashboard 登录凭证。

## 部署前必须确定的事

生产环境至少需要：

```bash
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export BETTER_AUTH_URL="https://tocsin.example.com"
export SERVER_URL="https://tocsin.example.com"
```

- `BETTER_AUTH_SECRET` 必须是本实例独有的随机值，至少 32 个字符并持久保存。也可以使用 `BETTER_AUTH_SECRET_FILE` 从单行文件读取；内联值非空时优先。
- `BETTER_AUTH_URL` 必须与实际 HTTPS 外部地址一致。`SERVER_URL` 用于事件直链，并在认证 URL 未设置时作为回落值。
- 通过多个 Host 或 Origin 访问时，配置 `BETTER_AUTH_ALLOWED_HOSTS` 与 `BETTER_AUTH_TRUSTED_ORIGINS`。仓库默认 Compose 未透传这两个变量，需要使用自己的 override。
- 在完成首次 owner 创建前，不要把实例暴露给公网。登录端点由 Better Auth 提供基础限流，但反向代理仍应承担全局限流和访问控制。

生产环境缺少有效认证密钥时，应用会拒绝提供服务，`/api/ready` 也会失败。完整变量和代理约束见 [Docker 生产部署](/operations/deploy-docker)。

::: warning 不要复用示例密钥
仓库历史中公开过的值会被生产运行时拒绝。也不要在每次重启时重新生成密钥，否则所有 dashboard session 都会失效。
:::

## 创建首个 owner

1. 启动实例并确认 `curl -fsS http://localhost:3000/api/ready` 成功。
2. 在实例尚未对外开放时打开 `/setup`。
3. 填写名称、邮箱和至少 8 个字符的密码。
4. 提交后，第一个注册用户会成为 `owner`，并自动登录 dashboard。

实例中存在任何已注册用户后，后续通过注册入口创建用户会被拒绝，错误为 `Owner user already exists`。此时 `/setup` 会跳转到 `/login`。

::: danger 首次访问者会成为 owner
首次 setup 没有单独的邀请码或部署令牌。若在创建 owner 前暴露 dashboard，第一个完成注册的人就会取得管理权限。先在受控网络内完成 setup，再开放反向代理。
:::

当前版本没有邀请、用户管理或角色编辑界面。虽然数据模型区分 `owner`、`admin` 和 `member`，`owner` 与 `admin` 才能进入 dashboard；不要把当前实例理解为已经具备完整的多用户权限管理。

## 登录与退出

在 `/login` 输入已创建的邮箱与密码。登录成功后，服务端通过 session cookie 维持 dashboard 会话；浏览器脚本不会获得原始 session token。

- 用户菜单中的「退出登录」结束当前浏览器会话并返回登录页。
- 退出当前浏览器不会自动清理其他设备上的会话。
- 修改或轮换 `BETTER_AUTH_SECRET` 会让该实例所有既有 session 失效；它不会修改 owner 密码。
- 当前版本没有在 console 中提供修改密码、忘记密码或邮件重置流程。不要假设存在自助找回入口。

## 核对和撤销会话

登录后进入「设置 → UI → 账号安全」，可以查看当前账号仍有效的 session：

| 字段 | 含义 |
| --- | --- |
| 客户端 | session 记录的 User-Agent；无记录时显示「未知客户端」 |
| IP | 认证请求记录的地址；无记录时显示「未知」 |
| 最近活动 | 该 session 最近一次更新的时间 |
| 有效期 | session 到期时间 |
| 状态 | 当前正在使用的会话，或其他已登录会话 |

列表只返回当前账号的未过期 session；不会返回 session token，也不接受客户端传入用户 ID 或 session ID。IP 与 User-Agent 取决于代理和认证运行时实际记录的数据，显示「未知」不代表会话来源异常，只表示该字段没有记录。

选择「退出其他设备」并确认后，Tocsin 会撤销当前账号除本文当前 session 之外的所有会话。当前浏览器保持登录，因此可以在事故处置时先清理其他设备。

::: warning 撤销会话不是修改密码
「退出其他设备」只清理已经签发的 session cookie。知道邮箱和密码的人之后仍然可以重新登录。如果怀疑密码已经泄露，不能只执行此动作，应立即限制 dashboard 的外网访问，并按事故流程评估账号恢复。
:::

当前面板不提供逐行撤销单个会话、最近登录历史或失败登录审计。不要把这些缺失项理解为系统已经记录了额外审计事件。

## 凭据丢失或泄露

### 仍能登录当前会话

1. 从受控浏览器登录 dashboard。
2. 在「设置 → UI → 账号安全」核对其他 session 的客户端、IP、最近活动与有效期。
3. 对无法解释的会话执行「退出其他设备」。
4. 检查告警源、通知目标、路由和飞书应用是否出现未授权修改。
5. 如果怀疑密码泄露，继续限制 dashboard 访问并启动账号恢复流程，不能只停在 session 撤销。

### 已经无法登录

当前版本没有忘记密码入口。不要通过删除整个 SQLite 文件来“重置登录”，那会丢失告警源、路由、通知目标、历史 Event、Delivery 和静默规则。

- 若还有已登录设备，可从该设备进入设置页并核对会话。
- 若没有任何可用 session，恢复范围应由备份与发布流程决定。优先使用经过验证的数据库备份；不要在未演练、未备份的生产库上直接修改 Better Auth 用户或密码表。
- 恢复数据库会回退到备份时间点，可能丢失之后的配置、Event 和 Delivery。先保全当前数据库与日志，再按 [备份、恢复与升级](/operations/backup-restore) 执行。

### 轮换认证密钥

轮换 `BETTER_AUTH_SECRET` 会让所有 dashboard session 失效，效果接近“让所有人重新登录”，但仍保留账号密码和业务数据。更新 secret store 后必须重启容器；运行中的进程不会重新读取密钥文件。

## Webhook 不要复用 dashboard 登录

告警源 Webhook 使用自己的接入 Token，或可选的服务端共享密钥。认证失败通常返回 `401`，告警源停用返回 `403`，Source 不存在返回 `404`。这些请求不会读取 dashboard cookie。

接入请求头、Provider 载荷和响应码见 [告警源接入参考](/integrations/providers)。生产变更时分别轮换 dashboard 认证密钥与 Source Token，不要认为一个轮换会让另一个自动失效。

## 常见故障

| 现象 | 检查与处理 |
| --- | --- |
| 访问 `/setup` 自动跳到 `/login` | 已存在注册用户。使用原 owner 登录；不要删除数据库来重新初始化。 |
| 创建 owner 返回 `Owner user already exists` | 另一个请求已先创建用户，或实例沿用了已有数据卷。回到登录页确认账号。 |
| 登录成功后又回到登录页 | 核对 `BETTER_AUTH_URL`、实际 HTTPS URL、代理 Host 与 Cookie 是否一致；多 Host 场景检查 allowed hosts 与 trusted origins。 |
| 所有请求包括 `/api/ready` 返回 `500` | 检查 `BETTER_AUTH_SECRET` 或 `_FILE` 是否缺失、无效、不可读或仍为公开占位值，然后查看容器启动日志。 |
| 账号安全列表显示「未知客户端」或「未知」IP | 该 session 行没有记录对应元数据。结合登录时间、有效性和其他操作判断，不要把空字段自动当作攻击证据。 |
| 「退出其他设备」按钮不可用 | 当前账号没有其他有效 session，没有可撤销对象。 |
| 撤销后某设备仍能进入 | 该设备可能在撤销后重新使用已知密码登录；也可能当前浏览器本身就是保留的 session。若怀疑密码泄露，立即限制访问并执行账号恢复。 |
| Dashboard 显示已登录但无权限 | 账号角色不是 `owner` 或 `admin`。当前版本没有角色管理界面，需要按受控实例管理流程处理。 |
| 更新 secret 后所有用户被登出 | 这是预期行为；使用原邮箱和密码重新登录。密码不会因 secret 轮换而改变。 |

## 上线检查清单

1. 生产认证 secret 已随机生成、持久保存，并通过 secret 文件或编排平台注入。
2. `BETTER_AUTH_URL` 与 `SERVER_URL` 使用最终外部 HTTPS 地址。
3. 多 Host 或临时域名已配置 allowed hosts、trusted origins 和代理层访问限制。
4. 实例在受控网络内完成首个 owner setup，并确认 `/setup` 之后会跳转登录。
5. 登录后检查「账号安全」列表，确认只有预期设备。
6. 为上游告警分别创建告警源 Token，不复用 dashboard 密码。
7. 将用户、session 和账号安全数据纳入数据库备份范围，并演练恢复。

相关页面：[Docker 生产部署](/operations/deploy-docker) · [备份、恢复与升级](/operations/backup-restore) · [故障排查](/operations/troubleshooting) · [告警源接入参考](/integrations/providers)
