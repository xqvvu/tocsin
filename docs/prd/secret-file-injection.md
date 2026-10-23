# 自托管 secret 文件注入（`BETTER_AUTH_SECRET_FILE`）

状态：已实现（REQ-244）。
关联：`docs/release/docker-production-deployment.md` §1、§3、§4、§7；`docs/release/backup-restore-upgrade.md` §7。

## 问题

Tocsin 的部署形态是「一个容器 + 一个数据卷 + 一个 SQLite 文件」。部署文档此前明确写着应用
**不支持** Docker secret 或 `*_FILE`，secret 只能通过环境变量进入进程
（`docs/release/docker-production-deployment.md` 的已知缺口表与 Secrets 章节）。这带来两个实际后果：

- `docker inspect`、`docker compose config`、`/proc/1/environ` 都能看到 `BETTER_AUTH_SECRET` 明文；
- Docker Swarm secret 只能挂载为文件，Kubernetes 推荐 Secret 卷而不是 env，这两条标准路径在 Tocsin 上
  无法使用，运维只能写一层 `BETTER_AUTH_SECRET=$(cat …)` 的 wrapper，值仍然会回到容器环境变量里。

## 用户故事

作为自托管 Tocsin 的运维，我希望把 `BETTER_AUTH_SECRET` 写进一个只读文件并挂载进容器，让
`docker compose config` / `docker inspect` 里只出现路径，从而复用 Compose file secret、Swarm secret
或 Kubernetes Secret 卷，而不需要自定义启动脚本。

## 范围

- 新增 `BETTER_AUTH_SECRET_FILE`：当内联 `BETTER_AUTH_SECRET` 为空时，从该路径读取 secret。
- 内联值优先；两者都为空时保持现有的 fail-closed 行为（production 拒绝启动）。
- 文件格式：单行裸值，≤ 4 KiB；去掉结尾换行；拒绝内部换行、空文件、缺失或不可读文件。
- 错误信息只包含变量名、路径与 errno，不包含文件内容；读到的值不写回 `process.env`。
- `docker-compose.yml` 透传 `BETTER_AUTH_SECRET_FILE`，并把 `BETTER_AUTH_SECRET` 的兜底值改为空。
- 部署文档说明 Compose / Swarm / Kubernetes / bind mount 的权限模型与轮换方式。

## 非目标

- 不支持其他环境变量的 `_FILE`（尤其是配置导入时的 `TOCSIN_SOURCE_*` / `TOCSIN_DEST_*` /
  `TOCSIN_FEISHU_APP_*` 引用仍只读 `process.env`）。
- 不实现外部 secret manager 协议（Vault、AWS Secrets Manager 等），不新增运行时依赖。
- 不改变 Better Auth 的 session 语义、投递语义或路由语义；不引入数据库迁移。
- 不在默认 compose 里加入真实的 `secrets:` 块：开箱 `docker compose up` 的 env 路径保持不变。

## 验收标准

1. 只设置 `BETTER_AUTH_SECRET_FILE` 时，`env.BETTER_AUTH_SECRET` 等于文件内容（去掉结尾换行）。
2. 同时设置两者时，内联 `BETTER_AUTH_SECRET` 生效，且不读取文件。
3. compose 转发的空字符串（`BETTER_AUTH_SECRET=""`、`BETTER_AUTH_SECRET_FILE=""`）按「未设置」处理，
   不会触发文件读取。
4. 结尾 `\n` / `\r\n` / 多个换行被剥离；secret 前后的空格原样保留。
5. 文件缺失、不可读、为空、超过 4 KiB、或包含内部换行时应用拒绝提供服务（首个请求即失败，
   `/api/ready` 返回 500）；错误信息包含变量名、路径与 errno，不包含文件内容。
6. 两者都为空时，production 仍以
   `BETTER_AUTH_SECRET is required in production (set BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE)`
   拒绝服务，`/api/ready` 返回 500，不会出现「健康但登录 500」。
7. 历史公开值（compose 旧默认值、`.env.example` 旧值、占位值）写进文件时同样被拒绝。
8. 现有 env-only 部署行为不变；`vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- `apps/console/src/lib/secret-file-env.ts`：server-only 纯函数 + 白名单 `SECRET_FILE_ENV_VARS`，
  可注入 `readFile` 以便单测，不打印任何内容。
- `apps/console/src/env.ts`：把解析结果作为 `runtimeEnv` 的最后一个 spread 合并，只影响传给
  `createEnv` 的对象，不改 `process.env`。
- `apps/console/src/lib/auth-config.ts`：production 缺失时的错误文案同时指出两个变量。
- `docker-compose.yml`、`apps/console/.env.example`、`docs/release/*`：部署契约与文档。
- 不触及 `packages/core`、`packages/api`、oRPC contract、SQLite schema 或投递/路由/auth 语义。
