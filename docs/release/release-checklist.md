# 发布 Checklist（人工 tagged release）

> 一句话结论：Tocsin 目前**没有任何发布自动化** —— 仓库只有 `ci.yml`（`check · test · build`）与
> `e2e.yml`（浏览器 E2E），没有 release workflow、没有 changelog 工具；tag 已由人工创建（完整列表与
> 最新版本以 `git tag --list` 为准），并且 tag 本身不会触发任何东西。

核实时间 2026-10-22，核实基线 `origin/main` @ `63c8931`；2026-10-23 在 `origin/main` @ `3ff8ef5`
复核 tag 数量与当前版本号。本文只回答“怎么切一个 tag”；发布前的产品验收
清单在 `docs/release/mvp-rc-checklist.md`，部署与数据操作见
`docs/release/docker-production-deployment.md` 和 `docs/release/backup-restore-upgrade.md`。

## 1. 现状：有什么、没有什么

| 事项                     | 现状                                                             | 证据                                                                     |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| CI                       | 两个 workflow：`check · test · build` 与浏览器 E2E              | `.github/workflows/ci.yml`：`vp check` → `vp run -r test` → `vp run -r build`；`.github/workflows/e2e.yml`：Playwright + Chromium |
| CI 触发条件              | `push` 到 `main` 与 `pull_request`                               | 两个 workflow 相同；没有 `tags:` 过滤                                     |
| Release / publish workflow | 不存在                                                         | `.github/` 下只有 `ci.yml` 与 `e2e.yml`                                   |
| Changelog 与版本递增工具 | 不存在                                                           | 没有 `.changeset/`、没有 `CHANGELOG.md`、根 `package.json` 没有 `release` script |
| git tag                  | 首个 tag 为 `v0.1.0-beta.9`（2026-10-19）                        | 此前的 `0.1.0-beta.8` 没有对应 tag，版本追溯以发布记录为准                |
| 版本号来源               | 只有根 `package.json`（当前为 `0.1.0-beta.120`，以下次发布时的值为准） | 启动日志的 `tocsin.runtime` 版本来自根 `package.json`（`apps/console/src/server/runtime/system-information.ts`） |
| 容器镜像发布             | 没有自动化，只有手工 recipe                                       | 没有 CI 构建/推送步骤；`Justfile` 提供 `just docker-buildx <image> <tag>`（多平台构建并 `--push`）、`just docker-tag`、`just docker-push`，registry 与 tag 约定见第 4 节。`docker-compose.yml` 默认用本机构建的 `image: tocsin:local` |
| E2E / Docker smoke 自动化 | E2E 已接入 CI，Docker smoke 仍为本地 gate                      | `apps/console/e2e/alert-flow.spec.ts` + `apps/console/playwright.config.ts`，由 `.github/workflows/e2e.yml` 在 push 到 main 与 PR 上运行；`scripts/docker-smoke.sh` 与 `just docker-smoke` 保留为本地人工 gate |

结论：**每次 release 仍是一次全手工动作。** 不要假设打 tag 会产出镜像、Release note 或 changelog。

## 2. 打 tag 前必须核对

1. **CI 绿在目标 commit 上。** 到 GitHub Actions 看 `CI` workflow 的 `check · test · build`，必须是
   `main` 最新 commit 上的成功记录；浏览器 E2E 由独立的 `E2E` workflow（`e2e.yml`）在 push 到 main
   与 PR 上运行，也必须是成功记录。注意 CI **不**构建 Docker 镜像、**不**跑 compose smoke；本地可用
   `just docker-smoke` 执行，发布前仍需人工触发。
2. **本地跑完整 gate。** 在干净 worktree 上执行：

   ```bash
   vp install --frozen-lockfile
   vp check
   vp run -r test
   vp run -r build
   ```

3. **Docker 冒烟。** 执行 `just docker-smoke`（底层是 `scripts/docker-smoke.sh`）。脚本加载
   `docker-compose.smoke.yml`，使用独立的 `tocsin:smoke` 镜像与 `tocsin-smoke-data` 卷，结束时只删除
   该卷，不会触碰真实部署的 `tocsin-data`。

   ```bash
   just docker-smoke
   ```

   不要再用裸 `docker compose up` / `down -v` 做冒烟：基础 compose 文件固定了生产镜像名与卷名。

4. **手工走一遍产品验收路径。** E2E 已覆盖 setup → Source → Destination → Route → webhook →
   Event/Delivery 列表；失败 retry、历史过滤、重启、导出仍无自动化守护，发布前按
   `docs/release/mvp-rc-checklist.md` 「验收标准」人工补走：setup/login → 建 Source → 复制 webhook URL →
   建 Destination 并 preview/test → 建 Route → 发 webhook → 看 Event/Delivery → 失败 retry → 重启进程 →
   导出配置不含明文 secret。
5. **文档与版本一致。** 版本号、README 状态段落、部署/备份文档、`mvp-rc-checklist.md` 的结论日期要对齐
   本次 tag 的事实；不要留下“尚无部署文档”这类已经过时的说法。
6. **数据兼容性自查。** 当前 migration plan 为 `0001_initial_schema` + `0002_suppressions` +
   `0003_complete_legacy_schema` + `0004_oncall_dispatch_started_at` +
   `0005_deliveries_destination_id_health`。runner 会跳过已应用的版本，所以
   **修改已提交的 migration 对任何已有数据库都是 no-op**；本次发布若改 schema，必须新增 forward step
   并在 `migrate/plan.ts` 注册。判断方法与后果见 `docs/release/backup-restore-upgrade.md`。

## 3. 打 tag（人工）

```bash
git switch main
git pull --ff-only
git status --porcelain      # 必须为空
git tag -a "v<version>" -m "Tocsin v<version>"
git push origin "v<version>"
```

约定与限制，逐条说清：

- tag 名采用 `v<根 package.json 的 version>`。首个 annotated tag 为 `v0.1.0-beta.9`；
  最新 tag 以 `git tag --sort=-v:refname | head -1` 为准，不要在这里维护固定上界以免漂移；
  后续沿用同一约定；如果要换命名，改这里和 Release 说明即可。
- 用 annotated tag（`-a`）以便携带一条发布说明；这是建议，仓库没有任何工具强制 tag 类型。
- 版本号只存在于根 `package.json`，没有工具会替你递增。要发新版本时先改 `package.json`、提交、通过 CI，
  再在这个 commit 上打 tag。

## 4. tag 会触发什么、不会触发什么

- **会触发：什么都没有。** `ci.yml` 只在 `push` 到 `main` 和 `pull_request` 时运行，也没有其它 workflow
  监听 tag。
- **不会触发**：镜像构建、镜像推送、GitHub Release、changelog 生成、npm 发布（所有 workspace package
  都是 `private`）。
- 因此容器镜像需要人工构建和命名。本机可以用 `docker build -t tocsin:<version> .`；要推到
  registry 就用 `just docker-buildx <image> <tag>`（多平台 `linux/amd64,linux/arm64` + `--push`，
  已关闭 provenance/SBOM 以兼容阿里云 ACR）或 `just docker-tag` + `just docker-push`，见根目录
  `Justfile`。当前发布使用 `registry.cn-hangzhou.aliyuncs.com/xqvvu/vane:<version>`，镜像 tag 不带
  `v` 前缀。建议每个版本单独打镜像标签，因为 compose 默认的 `tocsin:local` 会被下一次 build 覆盖，
  回滚时没有旧镜像可用。

## 5. 发布之后

- **手工写 Release 说明。** 仓库没有 release note 模板，也没有要从 changelog 生成的内容；需要有人从
  `git log` 归纳本版本的主要变化，并在 GitHub 上创建 Release（这一步是人工操作，未在本仓库中固化）。
- **保留回滚材料。** 上一个可用镜像标签 + 发布前的数据卷备份；步骤见
  `docs/release/backup-restore-upgrade.md`。
- **记录本次的已知空白。** 至少包括：没有 release 自动化、Docker smoke 脚本保持本地人工 gate
  且不接入 CI（E2E 已接入）、没有稳定 public management REST API。

## 6. 已知空白（不要假装存在）

- 没有 release workflow：tag 与发布产物之间没有自动关联。
- 没有自动化版本递增与 changelog。
- 没有镜像仓库的自动化发布：只有 `Justfile` 里三条手工 recipe，没有 CI 任务；registry 与 tag 约定
  见第 4 节，但仍需人工执行。
- 浏览器 E2E 已由 `.github/workflows/e2e.yml` 在 push 到 main 与 PR 上自动运行（本地入口
  `just e2e`）；compose smoke（`just docker-smoke`）按 `mvp-rc-checklist.md` 的决定保留为本地人工
  gate，CI 仍覆盖不到容器运行时。
- 没有发布说明模板，也没有“发布失败/撤回”的预案文档。
