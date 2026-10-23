# 决策记录：自托管 secret 文件注入（REQ-244）

日期：2026-10-23（第 98 轮自主迭代）
事项：是否为 `BETTER_AUTH_SECRET` 增加 `*_FILE` 注入，以及切片范围。
决策方式：3 人 EXPERT_PANEL（安全与可靠性、产品与运维、独立评估者），互不共享结论。

## 背景

- `docs/release/docker-production-deployment.md` 明确把「没有 Docker secret / `*_FILE` 支持」列为已知缺口。
- 部署形态是单容器 + `/data` 卷；进程以 root 启动后 `gosu node`（uid 1000）运行。
- `apps/console/src/env.ts` 只读 `import.meta.env` + `process.env`。
- `docker-compose.yml` 过去把 `BETTER_AUTH_SECRET` 兜底为公开占位值，任何非空内联值都会遮住文件路径。

## 三个方案

- **A（窄）**：只支持 `BETTER_AUTH_SECRET_FILE`，在应用侧解析；内联值优先；compose 兜底改为空并透传 `_FILE`。
- **B（宽）**：A 之外，配置导入时的 `TOCSIN_SOURCE_*` / `TOCSIN_DEST_*` / `TOCSIN_FEISHU_APP_*` 引用也支持
  `_FILE`。
- **C**：不实现，只保留文档缺口。

## 专家意见

### 安全与可靠性专家

推荐 A（修正版），明确否决 B：

- B 会让「已认证的配置导入」变成「按导入文件里的任意变量名读取文件」的原语，能把 `/data/tocsin.sqlite`、
  `/proc/self/environ` 等读进目标凭证并外带，属于不必要的权限升级。
- A 必须先修两个空值语义缺陷：compose 会注入 `BETTER_AUTH_SECRET=""`，空串必须视为未设置，否则 `_FILE`
  永远不生效；空白路径也必须视为未设置，否则会触发 `readFileSync("")`，让所有 env-only 部署启动失败。
- 只剥一个尾随换行不够；应拒绝内部换行（PEM、`--from-env-file` 产物）与超大文件。
- 错误只能带变量名、路径与 errno，不能带内容；不要把值写回 `process.env`。
- 权限模型必须按 Compose file secret / Swarm / K8s / bind mount 分别写清楚；entrypoint 只 chown `/data`。

### 产品与运维专家

推荐 A：

- A 解锁的是 `--env-file` 做不到的三条真实路径：Compose file secret、Swarm secret、K8s Secret 卷；
  `docker inspect` 只留路径，轮换只需替换文件 + 重启容器。
- 去掉 compose 占位兜底是**必须**的，不是可选项：占位值非空会遮住 `_FILE`。兜底改为空后仍然 fail-closed，
  只是错误文案从「必须替换占位值」变成「生产必需」，可操作性等价。
- B 应推迟：导入 secret 本来就持久化在 SQLite，导入是低频控制台操作，收益低而威胁面更大。
- 文档要避免「支持 Docker secret」这种笼统承诺，必须写清裸值格式、uid 1000 可读、轮换需重启。

### 独立评估者

**APPROVE WITH CHANGES**：

- 验收标准可用 `vp check` + `vp -C apps/console test run` 覆盖；必须补 env 层「内联胜出」与「不写回
  `process.env`」断言、超限/多行/空白路径用例、错误不含内容的显式断言。
- 文档必须同步 `docker-production-deployment.md`、`README.md`、`mvp-rc-checklist.md`，并给出 Compose
  挂载示例，否则功能「看起来可用、实际必然 ENOENT」。
- 契约测试的 `fileLine` 要先 `.toBeDefined()`。
- 无迁移、无持久化状态、无新依赖、无新服务；可逆性高。

## 最终选择

**A（窄切片），并采纳两位专家的全部修正项**：

1. 内联值与文件路径都为空白时一律视为未设置。
2. 文件必须是单行裸值、≤ 4 KiB；剥离结尾 CR/LF；拒绝内部换行。
3. 错误只含变量名、路径与 errno；不写回 `process.env`。
4. compose 兜底值为空并透传 `BETTER_AUTH_SECRET_FILE`。
5. 文档按编排方式写清权限模型，并给出 Compose `secrets:` 示例。
6. B 推迟，作为独立候选（导入路径仍只读 `process.env`）。

## 回滚

- 代码：单 commit revert；无迁移、无持久化格式变更。
- 已使用 `_FILE` 的实例：先改回内联 `BETTER_AUTH_SECRET`，再回滚镜像 tag。
- 不建议把 compose 占位兜底加回来：空值 + `required` 同样是 fail-closed。

## 验收证据

- 单元/契约测试：`apps/console/src/lib/secret-file-env.test.ts`、`deployment-secrets.contract.test.ts`。
- 构建产物烟测：只设 `BETTER_AUTH_SECRET_FILE` 时 `/api/ready` 返回 200；文件缺失时返回 500，日志含
  `Unable to read BETTER_AUTH_SECRET_FILE at <path>: ENOENT` 且不含内容。
