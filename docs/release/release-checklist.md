# 发布 Checklist（首个 tagged release）

> 一句话结论：Tocsin 目前**没有任何发布自动化** —— 仓库只有 `ci.yml`（`check · test · build`），没有
> release workflow、没有 changelog 工具、没有任何 git tag；下面是从现在到第一个 tag 的**人工**流程，
> 并且明确说明 tag 本身不会触发任何东西。

核实时间 2026-10-13，核实基线 `origin/main` @ `4e17c28`。本文只回答"怎么切一个 tag"；发布前的产品验收
清单在 `docs/release/mvp-rc-checklist.md`，部署与数据操作见
`docs/release/docker-production-deployment.md` 和 `docs/release/backup-restore-upgrade.md`。

## 1. 现状：有什么、没有什么

| 事项                     | 现状                                                             | 证据                                                                     |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| CI                       | 只有 `check · test · build` 一个 job                             | `.github/workflows/ci.yml`：`vp check` → `vp run -r test` → `vp run -r build` |
| CI 触发条件              | `push` 到 `main` 与 `pull_request`                               | 同上；没有 `tags:` 过滤                                                  |
| Release / publish workflow | 不存在                                                         | `.github/` 下只有 `ci.yml`                                               |
| Changelog 与版本递增工具 | 不存在                                                           | 没有 `.changeset/`、没有 `CHANGELOG.md`、根 `package.json` 没有 `release` script |
| git tag                  | 一个都没有                                                       | `git tag -l` 输出为空，所以这次是**第一个** tag                          |
| 版本号来源               | 只有根 `package.json`（当前 `0.1.0-beta.8`）                     | 启动日志的 `tocsin.runtime` 版本来自根 `package.json`（`apps/console/src/server/runtime/system-information.ts`） |
| 容器镜像发布             | 不存在                                                           | 没有 registry push 步骤；`docker-compose.yml` 使用本机构建的 `image: tocsin:local` |
| E2E / Docker smoke 自动化 | 不存在                                                          | 仓库没有 playwright 或 smoke 脚本；`docs/release/mvp-rc-checklist.md` A 节两条仍未勾选 |

结论：**首个 release 是一次全手工动作。** 不要假设打 tag 会产出镜像、Release note 或 changelog。

## 2. 打 tag 前必须核对

1. **CI 绿在目标 commit 上。** 到 GitHub Actions 看 `CI` workflow 的 `check · test · build`，必须是
   `main` 最新 commit 上的成功记录。注意 CI **不**构建 Docker 镜像、**不**跑 E2E、**不**跑 compose
   smoke，这些今天只能手工补。
2. **本地跑完整 gate。** 在干净 worktree 上执行：

   ```bash
   vp install --frozen-lockfile
   vp check
   vp run -r test
   vp run -r build
   ```

3. **手工 Docker 冒烟（自动化落地前必须人工做一次）。**

   ```bash
   docker compose build
   BETTER_AUTH_SECRET="$(openssl rand -hex 32)" docker compose up -d
   curl -fsS http://127.0.0.1:3000/api/ready     # 期望 200 且 checks 全为 ok
   docker compose logs --tail=50 console
   docker compose down                            # 不加 -v，保留 tocsin-data volume
   ```

   必须显式传 `BETTER_AUTH_SECRET`：`docker-compose.yml` 里内置了一个公开的默认值，不覆盖也能启动。

4. **手工走一遍产品验收路径。** `docs/release/mvp-rc-checklist.md`「验收标准」的 1–12 条目前没有自动化
   守护，发布前按那份清单人工执行：setup/login → 建 Source → 复制 webhook URL → 建 Destination 并
   preview/test → 建 Route → 发 webhook → 看 Event/Delivery → 失败 retry → 重启进程 → 导出配置不含明文
   secret。
5. **文档与版本一致。** 版本号、README 状态段落、部署/备份文档、`mvp-rc-checklist.md` 的结论日期要对齐
   本次 tag 的事实；不要留下"尚无部署文档"这类已经过时的说法。
6. **数据兼容性自查。** 确认本次发布没有原地修改 SQLite baseline migration。当前 migration plan 只有
   `0001_initial_schema`，runner 会跳过已应用的版本，所以**改 baseline 对任何已有数据库都是 no-op**；
   判断方法与后果见 `docs/release/backup-restore-upgrade.md`。

## 3. 打 tag（人工）

```bash
git switch main
git pull --ff-only
git status --porcelain      # 必须为空
git tag -a v0.1.0-beta.8 -m "Tocsin v0.1.0-beta.8"
git push origin v0.1.0-beta.8
```

约定与限制，逐条说清：

- tag 名采用 `v<根 package.json 的 version>`。仓库**没有任何既有 tag** 可以参考，所以这是本文新提出的
  约定，不是历史惯例；如果要换命名，改这里和 Release 说明即可。
- 用 annotated tag（`-a`）以便携带一条发布说明；这是建议，仓库没有任何工具强制 tag 类型。
- 版本号只存在于根 `package.json`，没有工具会替你递增。要发新版本时先改 `package.json`、提交、通过 CI，
  再在这个 commit 上打 tag。

## 4. tag 会触发什么、不会触发什么

- **会触发：什么都没有。** `ci.yml` 只在 `push` 到 `main` 和 `pull_request` 时运行，也没有其它 workflow
  监听 tag。
- **不会触发**：镜像构建、镜像推送、GitHub Release、changelog 生成、npm 发布（所有 workspace package
  都是 `private`）。
- 因此容器镜像需要本机构建并自行命名。建议每个版本单独打镜像标签，例如
  `docker build -t tocsin:0.1.0-beta.8 .`，因为 compose 默认的 `tocsin:local` 会被下一次 build 覆盖，
  回滚时没有旧镜像可用。

## 5. 发布之后

- **手工写 Release 说明。** 仓库没有 release note 模板，也没有要从 changelog 生成的内容；需要有人从
  `git log` 归纳本版本的主要变化，并在 GitHub 上创建 Release（这一步是人工操作，未在本仓库中固化）。
- **保留回滚材料。** 上一个可用镜像标签 + 发布前的数据卷备份；步骤见
  `docs/release/backup-restore-upgrade.md`。
- **记录本次的已知空白。** 至少包括：没有 release 自动化、没有 E2E、没有 Docker smoke 自动化、没有
  稳定 public management REST API。

## 6. 已知空白（不要假装存在）

- 没有 release workflow：tag 与发布产物之间没有自动关联。
- 没有自动化版本递增与 changelog。
- 没有镜像仓库发布流程；镜像只在本地存在。
- 没有 E2E 与 compose smoke 自动化，CI 覆盖不到浏览器路径和容器运行时。
- 没有发布说明模板，也没有"发布失败/撤回"的预案文档。
