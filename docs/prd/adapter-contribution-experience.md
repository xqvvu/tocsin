# PRD: Adapter 贡献体验（Destination 贡献路径最低摩擦化）

Labels: `draft-for-review`

状态：部分已交付（2026-10-21 复核）。contributor guide、scaffold、test-kit、destination registry
audit 与 iconName 消费均已落地；F1（kind 多份真相）、F2'（secret 路径两处手写）、F3（表单手写
per-kind 分支）、F5（send 信封重复）仍成立。下文「不存在」盘点保留为当时的现状记录。

- 方向来源：`docs/prd/post-mvp-planning.md:176`（候选方向 6「Adapter 贡献体验」）。
- 约束来源：`docs/adr/0002-curated-adapter-extension-model.md`、`docs/architecture/adapter-extensibility.md`。
- 范围：只覆盖 **destination adapter**（provider 侧共用同一模式，作为后续增量）。

## Problem Statement

Tocsin 的 destination 扩展模型已经成型：封闭 `DestinationKind` 枚举、schema-backed manifest、纯函数
`preview` / `send`、显式集中注册、client-safe catalog。但"写一个新 adapter"目前不是一条**可发现、可
校验、可复制**的路径，而是一条需要照抄现有 adapter 的内部路径。

一个外部贡献者面对的现实是：

- 仓库里**没有** contributor guide、checklist 或 scaffold（无 `CONTRIBUTING*`；`docs/` 下只有
  `docs/adr/0002-*.md` 与 `docs/architecture/adapter-extensibility.md`，两者都是决策记录而非操作手册）。
- 新 adapter 的**大部分改动落在 `apps/console`**，而不是 `packages/destinations`。contributor 必须
  先读懂一个 1249 行的 `destination-form.tsx`、一个 409 行的 `destination.helpers.ts` 和一个按 kind 分
  支的 portable export，才知道自己"漏了什么"。
- 必须处理的站点里，**有的会编译失败（fail-loud），有的静默失效（fail-silent）**。后者已经构成一个
  安全边界缺陷（见摩擦点 F2）。
- manifest 声称的部分能力**是假的**：`iconName` 被声明、被投影进 catalog、但 console 忽略它（F7）。
- 一半的隐性知识（`preview` 失败形状、`renderedPayload` 必填、`errorKind` 闭合集合、`configFields`
  与 `secretFields` 的对齐规则）只存在于 ADR 0002 的几十条决策 bullet 里。

结果是：**贡献摩擦不是"配置太复杂"，而是"没有一条唯一真相 + 没有护栏"。** 贡献者要么花大量时间逆向
工程，要么漏改一处静默失败的站点，要么干脆放弃。本方向的目标是把 destination 贡献从"读懂内部实现"
变成"填一个 manifest + 写一个 render 函数"，其余由框架承担并 guard。

## 现状盘点

### A. 写一个新 destination adapter 现在要动的文件（精确清单）

以下为 `slack` adapter 作为参照（`packages/destinations/src/slack/`，adapter-local 共 **264 LOC** +
测试 523 LOC）推算出的**最小完整改动面**。

**A1. adapter-local（贡献者自己写的 6 个文件）**

| # | 文件 | 每步要点 |
| --- | --- | --- |
| 1 | `packages/destinations/src/<kind>/schema.ts` | 定义 `z.strictObject` typed config；与 manifest 字段必须一致（见 F6：无人自动校验这个一致性） |
| 2 | `packages/destinations/src/<kind>/manifest.ts` | JSON-safe manifest：`kind` / `configVersion` / `lifecycle` / `displayNameKey` / `descriptionKey` / `iconName` / `configFields` / `secretFields` / `capabilities`；`satisfies DestinationManifest<"<kind>">` |
| 3 | `packages/destinations/src/<kind>/payload.ts` | 渲染 preview / wire payload；需自己记得走 `DestinationTemplateEngine` 与 `presentation` |
| 4 | `packages/destinations/src/<kind>/adapter.ts` | `Adapter.define({ manifest, configSchema, preview, send })`；`send` 里手写 parse→render→fetch→classify 信封 |
| 5 | `packages/destinations/src/<kind>/index.ts` | barrel export（4 行） |
| 6 | `packages/destinations/src/<kind>/index.test.ts` | 自测；**必须自己复制一份 `DestinationSendInput` 字面量**（见 F4） |

**A2. packages 侧接线（3 处，全部 fail-loud）**

| # | 文件:符号 | 每步要点 |
| --- | --- | --- |
| 7 | `packages/core/src/destination/destination.ts:7` `DestinationKindSchema` | 加入新 kind；这是全仓的 kind 真相之一（→ 与 8/12/19 并行，见 F1） |
| 8 | `packages/destinations/src/registry.ts:75-86` `createDefaultDestinationRegistry` | 在 `satisfies DestinationAdapter[]` 数组里显式注册（无 glob 自动发现，ADR 0002 明确） |
| 9 | `packages/destinations/package.json` `exports` | 加 `"./<kind>": "./src/<kind>/index.ts"` 子路径导出 |

**A3. console / UI 侧接线（≈9 个文件，其中 ≥3 处 fail-silent）**

| # | 文件:符号 | 每步要点 | 保障 |
| --- | --- | --- | --- |
| 10 | `apps/console/src/i18n/messages/en-US.json` | 为 manifest 引用的**每个** message key 加英文文案（当前 `destinations.*` 共 200 key，zh 必须同步） | fail-loud（`apps/console/src/i18n/destination-catalog.test.ts`） |
| 11 | `apps/console/src/i18n/messages/zh-Hans.json` | 同上中文文案 | fail-loud（同测试） |
| 12 | `apps/console/src/features/destinations/model/destination-form.ts:27` `DestinationFormKind` | 扩充 kind union；这是**第二份** kind 真相 | fail-loud |
| 13 | `apps/console/src/features/destinations/model/destination-form.ts:326,385` `destinationConfigFromForm` / `destinationConfigPatchFromForm` | 手写该 kind 的表单字段 → config 映射分支 | fail-loud（union 收窄） |
| 14 | `apps/console/src/features/destinations/ui/destination-form.tsx:101-104` | kind 下拉选项；另需在渲染分支（如 `:926` webhook / `:678` feishu / `:622` email）加该 kind 的字段块 | 静默（只少一个下拉项） |
| 15 | `apps/console/src/features/destinations/ui/destination-kind-icon.tsx:19-27` | 加 icon `switch` case + `import ...svg?url`；**忽略 manifest 的 `iconName`** | fail-loud（TS2366，声明返回 `string` 但有路径不返回） |
| 16 | `packages/destinations/assets/destination-icons/<icon>.svg` | 新增图标资产 | 静默 |
| 17 | `apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts:60,169,230,276` | 四处 kind 分支：operational config 投影、metadata、`configuredSecretFieldPaths`、`configEndpoint` | fail-loud（`:268,:286` 有 `_exhaustive: never`） |
| 18 | `apps/console/src/server/configuration/config-portability.ts:286` `destinationSecretPaths` | portable export 的 secret 脱敏路径列表 | **fail-silent**（nested ternary 兜底 `: []`，见 F2） |
| 19 | `apps/console/src/features/destinations/ui/feishu-dynamic-properties-field.tsx:32` `BindingSelectorCases["destination.kind"]` | 模板绑定的 `destination.kind` 可选取值 | 静默 |
| 20 | `packages/destinations/src/registry.test.ts` + `apps/console/.../destination-form.test.ts` 等 | 更新 catalog kind 列表等断言 | fail-loud |

**合计：约 20 个文件，其中 adapter-local 只有 6 个，跨包 / console 侧约 14 个。**

### B. 靠"照抄别的 adapter"的隐性知识（未文档化）

| 隐性知识 | 出处（照抄来源） | 现状 |
| --- | --- | --- |
| `DestinationSendInput` 测试字面量（约 25 行） | 4 个 adapter 的 `index.test.ts` 各自复制一份 | 无共享 factory（F4） |
| `fakeFetch` 记录调用（`calls: Array<{url, init}>`） | 各测试自行手写 | 无 test helper |
| `preview` 失败必须返回 `{ templateError: { diagnostics: zodTemplateDiagnostics(error) } }` | `slack/adapter.ts` preview 分支 | 无文档、无类型 |
| `R.fail` 的 `renderedPayload` 在**每个**失败分支都必填 | `slack/adapter.ts` / `email/adapter.ts` | ADR 0002 有决策、无 contributor 文档 |
| `errorKind` 是 6 值闭合集合（`:51`）、`retryHint` 是 3 值（`:59`） | `packages/destinations/src/types.ts:51-59` | 有类型，无"我该选哪个"的指引 |
| `Adapter.getTransportContext(context)` 解构出的 `{ fetch }` 而非 `context.fetch` | `slack/adapter.ts:45`（`const { fetch } = Adapter.getTransportContext(context)`） | 无文档 |
| `configFields` 的 11 种字段类型 / 7 种 secret kind 该在什么时候用哪个 | `packages/core/src/adapter-manifest.ts:135`（discriminated union）、`:29`（secret kind enum） | 只有 schema，无选型指引 |
| `defaultValue` 必须与 `configSchema` parse 后的默认值一致 | ADR 0002 决策；`packages/destinations/src/registry.test.ts` 只覆盖 feishu 的字段类型 | 无自动校验（F6） |
| `manifest.configFields` **不驱动**表单渲染，只驱动 catalog 与 i18n | `destination-form.ts:213`（只有 template 的 `modes` 从 manifest 读） | 贡献者最易误判的一点（F3） |

## 摩擦点（按"最可能踩坑 / 放弃"排序）

### F1. kind 有 **4 份并行真相**，靠人工同步

- `packages/core/src/destination/destination.ts:7` — `DestinationKindSchema`（封闭枚举）
- `packages/destinations/src/registry.ts:75-86` — `createDefaultDestinationRegistry` 注册列表
- `apps/console/src/features/destinations/model/destination-form.ts:27` — `DestinationFormKind`
- `apps/console/src/features/destinations/ui/feishu-dynamic-properties-field.tsx:32` — `BindingSelectorCases["destination.kind"]`

没有任何单一真相。贡献者改 4 处、且这 4 处没有互相校验。

### F2'. secret 路径仍有两份手写真相（安全边界）

**2026-10-21 复核：静默兜底已消除。** `config-portability.ts:426-457` 的
`destinationKindSecretPaths` 已改为带 `_exhaustive: never` 的穷尽 switch，新增 kind 会 typecheck
失败，而不是静默落进 `: []`。

剩余缺口是两处仍各自手写 secret 路径、未从 `manifest.secretFields` 派生：

- `apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts:247-287`
  的 `configuredSecretFieldPaths`；
- `apps/console/src/server/configuration/config-portability.ts:442-457` 的
  `destinationKindSecretPaths`。

两处可能随 adapter 演进不一致（C4 / F2'）。

### F3. manifest 不是表单真相：UI 表单是手写 per-kind 分支

`apps/console/src/features/destinations/ui/destination-form.tsx` 1249 行 +
`apps/console/src/features/destinations/model/destination-form.ts` 751 行。字段→config 的映射按 kind
手写在 `destinationConfigFromForm`（:326）与 `destinationConfigPatchFromForm`（:385）。

**目前只有 `template` 字段的 `modes` 是从 manifest 读的**（`destination-form.ts:213`
`templateConfigField(catalog, kind)`），其余 `configFields` 一律不参与渲染。贡献者的自然预期是
"我在 manifest 里声明了字段它就该出现"——事实并非如此；想改表单必须进 `apps/console`。ADR 0002 把
"逐步替换为 manifest-driven 表单渲染"写进了分阶段计划第 7 步，但尚未落地。

### F4. 没有 fixture / test-kit：4 份复制的 send input

`packages/destinations/src/{slack,generic-webhook,email,feishu}/index.test.ts` 各自复制一份结构相同的
`DestinationSendInput` 字面量（约 25-45 行/份）。没有 factory、没有 fake transport builder；`R` /
`Send` / `Adapter`（`packages/destinations/src/utils.ts:17,33,68`）只有运行时 helper，没有 test helper。
贡献者唯一能做的动作是"打开 slack 的测试，复制粘贴，替换 kind 名"。

### F5. `send()` 信封是复制粘贴（~80 行 boilerplate / kind）

`slack/adapter.ts`（100 行）与 `email/adapter.ts` 的 `send()` 逐段同构：`safeParse` → 失败即
`R.fail(configuration_error)` → `renderXxxPayload` → `try/catch` 判 `isValidationError` →
`Adapter.getTransportContext` 取 `fetch` → `fetch(url, {method, headers, body})` →
`Send.readResponseBody` → 成功 `R.ok` / 失败 `R.fail(http_error, httpStatusToRetryHint)` →
`catch` → `Send.transportFailureResult`。（可用 diff 验证：除 URL/字段名/成功判据外结构完全相同。）
其中只有 URL 构造、请求头、body 与"成功判据"是每个 adapter 真正的差异。

### F6. destination 侧没有 registry audit；`secretFields` 无人消费

- `packages/providers/src/registry.ts:88` 有 `audit(options)`：检查 `sensitive` ↔ `secretFields` 对齐、
  message key 存在、catalog 不泄漏运行时内部（`:108,:149,:159`）。
- `packages/destinations/src/registry.ts` **没有 audit**（`grep -c audit` = 0）。destination 的对应
  检查散落在手写测试里（`packages/destinations/src/registry.test.ts`、
  `apps/console/src/i18n/destination-catalog.test.ts`）。
- `manifest.secretFields` 在 destination 侧**没有任何运行时消费者**：全仓引用只有 manifest 定义、
  `packages/destinations/src/types.ts:95` 的 schema、console i18n 测试的 key 校验。`destination.helpers.ts`
  的 `configuredSecretFieldPaths:230` 与 `config-portability.ts` 的 `destinationSecretPaths:286` 都是
  **重新手写一遍** secret 路径，而不是从 manifest 派生。

后果：贡献者以为 `secretFields` 被框架用上了，实际上脱敏逻辑是 console 里另一份手写清单，且两份可以
不一致而无人报警。

### F7. `iconName` 是"假能力"

manifest 声明 `iconName`（`packages/destinations/src/slack/manifest.ts:11`），registry 投影进 catalog
（`packages/destinations/src/registry.ts:63`），但 console 的第一个 icon 消费点
`apps/console/src/features/destinations/ui/destination-kind-icon.tsx:19-27` **忽略它**，自己 `switch(kind)`
硬编码 `import ...svg?url`。贡献者在 manifest 里写 `iconName: "discord"` 不会有任何效果。

### F8. 领域知识不可发现，且没有交付物承载它

没有 contributor guide、没有 checklist、没有 scaffold、没有 `CONTRIBUTING*`。全部约束（11 种字段类型、
7 种 secret kind、safe dot path 规则、`ok` union 纪律、`renderedPayload` 必填、config version 与
lifecycle 必须显式声明且不默认 stable）只存在于 `docs/adr/0002-curated-adapter-extension-model.md` 的
几十条 bullet 与 `docs/architecture/adapter-extensibility.md` 里——两者都是**决策记录**，不是"如何做"
的操作手册。

## 与 ADR 0002 的关系

**结论：不冲突，本方向应当推进。** 但需要精确划界，因为"curated" 这个词容易被误读。

### ADR 0002 到底禁止了什么

ADR 0002 的首句是"provider 和 destination 扩展**优先服务仓库内维护的精选适配器**，而不是**运行时
安装第三方插件**"。它反对的对象是：

1. 运行时插件沙箱与依赖隔离。
2. 运行时包加载。
3. 动态 UI 执行。
4. 文件系统自动发现 / glob import（ADR 0002 明确：「默认 adapter 使用显式集中注册，不做文件系统自动
   发现或 glob import」）。

它**没有**反对"仓库外的贡献者向本仓库提 PR 加一个 adapter"。恰恰相反，ADR 0002 的整套设计
（独立目录模块、`@tocsin/destinations/<kind>` 子路径导出、identity helper 而非 abstract class、
最低测试契约）**就是为贡献者设计的**。

### 边界（本方向不得越过的线）

| ADR 0002 的封闭项 | 本 PRD 必须遵守 |
| --- | --- |
| `DestinationKind` 是封闭枚举（"MVP 保持 SourceProvider 和 DestinationKind 为封闭枚举"） | 不打开为开放字符串；只在既有枚举内降低贡献摩擦 |
| manifest 必须是 JSON-safe、可序列化，不含函数 / class / React / RegExp / fetch | scaffold 与审计按此校验，不放宽 |
| client-safe catalog 不含 `secretFields` / `configSchema` / 运行时方法 | audit 强制（对齐 providers） |
| 显式集中注册，无 glob | 保留 `createDefaultDestinationRegistry` 显式注册；仅降低"改哪里"的认知成本 |
| adapter 不自定义字段类型 / redaction DSL / JS 模板 | 不引入 |
| adapter runtime 只接收已解析 typed config，不碰 DB / env / logger | `Adapter.define` 扩展不能破坏该纪律 |

### 需要"演进 ADR"的部分（两处，都是**补齐既有决策**而非变更）

1. **destination registry audit**：ADR 0002 明确写道「Audit 方法检查跨 adapter/软规则，例如 enum 与
   registry 完全一致、`sensitive` 与 `secretFields` 对齐、deprecated replacement 存在、catalog 不含
   forbidden keys、默认值与 schema 一致」。这条**已在 providers 落地**（`providers/src/registry.ts:88`），
   **在 destinations 未落地**。补 destination audit 是执行 ADR 已有决定，不需 amend。
2. **manifest-driven 表单渲染**：ADR 0002 分阶段计划第 7 步即「最后逐步替换为 manifest-driven 表单渲染，
   复杂交互保留 feature override」。本方向是推进该计划，不是新决策。若最终选择"所有字段一律 manifest
   driven、彻底移除 per-kind 手写表单"，则需 amend ADR 0002 的"复杂表单作为 feature module 里的 override
   存在"这一句——见 Open Question 2。

### 如果误读为"运行时第三方插件 / 市场"——应否决

若把本方向理解成"让自托管用户在不 fork 的情况下运行时安装私有 adapter"或"做 adapter 市场"，那**与
ADR 0002 直接冲突，应明确否决**。`docs/prd/post-mvp-planning.md:177-179` 也把
「运行时第三方插件安装 / Marketplace / 动态加载远程 adapter」列为 out-of-scope。本 PRD 沿用该排除，
见 Out of Scope。

## 设计草案

### 目标形态：一个目录 + 一个 manifest + 一个 render 函数 + 一个测试夹具

理想情况下，贡献者新增一个 HTTP destination 只写这些：

```txt
packages/destinations/src/<kind>/
  manifest.ts     # kind / configFields / secretFields / capabilities / lifecycle / iconName
  adapter.ts      # Adapter.define({ manifest, configSchema, render, http })
  index.test.ts   # 用 @tocsin/destinations/test-kit 的 fixture + fakeFetch
```

其余全部由框架承担：kind 列表投影、表单渲染、i18n key 校验、secret 路径派生、catalog 投影 audit、
HTTP 发送信封。**贡献者不碰 `apps/console`。**

### 框架需要补的能力（8 项，按依赖排序）

**C1. kind 单一真相（消除 F1）**
console 的 kind 列表改为从 registry catalog 派生。服务端已通过
`apps/console/src/server/destinations/destination.service.ts:68`（`return this.destinations.toCatalog()`）
暴露 `DestinationCatalogOutputSchema`（`packages/api/src/schemas/destinations.ts:37`）。把
`destination-form.tsx:101-104` 的下拉、`DestinationFormKind`（`destination-form.ts:27`）与
`feishu-dynamic-properties-field.tsx:32` 的取值全部改为**读 catalog**，删除本地枚举。

**C2. manifest-driven 表单渲染（消除 F3）**
为 `packages/core/src/adapter-manifest.ts:135` 的 11 种字段类型实现通用 renderer：`text` / `textarea` /
`url` / `secret` / `password` / `template` / `boolean` / `number` / `string-list` / `key-value` / `select`。
先覆盖 slack、generic_webhook、email 的全部字段（它们已是纯声明式的），feishu 保留 feature override
（app / urgent / builtin-card，见 Open Question 2）。

**C3. destination registry `audit()`（消除 F6，与 providers parity）**
移植 `packages/providers/src/registry.ts:88` 的 audit 形状到
`packages/destinations/src/registry.ts`，检查：`sensitive` ↔ `secretFields` 对齐、enum ↔ registry 一致、
manifest message key 存在（现由 console 测试承担）、catalog 不含 `secretFields` / `configSchema`、
`defaultValue` ↔ `configSchema` parse 默认值一致。测试强制通过（ADR 0002：「测试必须强制通过」）。

**C4. secret 路径从 manifest 派生（消除 F2 + F6 的第二份手写清单）**
`configuredSecretFieldPaths`（`destination.helpers.ts:230`）与 `destinationSecretPaths`
（`config-portability.ts:286`）改为从 `adapter.manifest.secretFields[].path` 派生。这是**消除静默安全缺口
的关键一步**：新 kind 自动获得正确的脱敏路径，不再依赖有人记得改 ternary。

**C5. test-kit（消除 F4）**
新增 `@tocsin/destinations/test-kit`（或 `./testing` 子路径），导出：
- `destinationSendInput(overrides)` — 构造完整 `DestinationSendInput` 的 factory。
- `fakeFetch(handler)` — 记录 `{ url, init }` 的 `FetchLike` 实现，替换 4 份手写记录器。
现有 4 个 adapter 测试迁移过去。

**C6. HTTP 发送信封收敛（消除 F5）**
让框架执行既有 pipeline（`safeParse` → render → `fetch` → classify → `R.ok`/`R.fail`），adapter 只提供
纯函数：`url(config)` / `headers(config)` / `body(renderedPayload)` / `classify(response)`。
**关键约束**：不得取消 `send` 的全权覆盖能力（非 HTTP transport 与 feishu 的特殊成功判据需要它）；
提供 `HttpTransport.define` 便捷层，而非把 pipeline 做死。见 Open Question 1。

**C7. scaffold + contributor guide + checklist（消除 F8）**
- `scripts/`（现有 `scripts/docker-entrypoint.sh` 旁）加一个 scaffold：生成 C1 目标形态的 3 文件骨架。
- `docs/contributing/destination-adapter.md`：操作手册（不是决策记录），含 11 种字段类型选型、7 种
  secret kind 选型、`errorKind` / `retryHint` 决策表、`preview` 失败形状、必填 `renderedPayload`、
  最容易漏的站点清单。
- 一个"新增 kind checklist"，并让 C3 的 audit 把 checklist 变成测试。

**C8. `iconName` 真正生效（消除 F7）**
`packages/destinations/package.json` 已有
`"./assets/destination-icons/*": "./assets/destination-icons/*"` 子路径导出。console 的 icon 解析改为
按 catalog 的 `iconName` 映射到该目录（并发对缺失 asset 提供 fallback），删除
`destination-kind-icon.tsx:19-27` 的硬编码 switch。

## User Stories

1. 作为外部贡献者，我想读到一份**操作手册**（不是 ADR）和一个 scaffold 命令，从而在 10 分钟内拿到一个
   自测能跑通的 adapter 骨架。
2. 作为贡献者，我想只写一个目录（`manifest.ts` + `adapter.ts` + `index.test.ts`），就让我在 console 里
   能配置、预览、投递，**完全不改 `apps/console`**。
3. 作为贡献者，我想用共享 test-kit 构造 send input 与 fake transport，而不是抄第 5 份 fixture。
4. 作为贡献者，我想只实现少量纯函数（`url` / `headers` / `body` / `classify`），HTTP 发送信封由框架执行。
5. 作为贡献者，我想在 manifest 里声明 `iconName`、`configFields`、`secretFields` 后就**真的生效**，
   不需要再去 console 补一遍。
6. 作为维护者，我想 registry audit 在测试里强制通过，自动发现 `sensitive` ↔ `secretFields` 不一致、
   缺 i18n key、catalog 泄漏运行时内部、`defaultValue` 与 schema 不一致。
7. 作为维护者，我想 kind / icon / secret 路径都从**单一真相**派生，消灭 4 处并行枚举和 2 处手写 secret
   清单。
8. 作为维护者，我想新增 kind 时如果漏处理某处，**测试 fail-loud 而不是静默漏 secret**。
9. 作为维护者，我想 provider 与 destination 的贡献体验对齐（audit、test-kit、scaffold 同构），从而一套
   心智模型服务两类 adapter。

## Out of Scope

明确不做（其中 1-4 与 ADR 0002 或既有 PRD 直接冲突）：

1. **运行时第三方插件安装**（与 ADR 0002 首句冲突；亦见 `docs/prd/post-mvp-planning.md:177`）。
2. **Adapter marketplace / 远程 adapter 分发**（同 `post-mvp-planning.md:178`）。
3. **动态加载远程 adapter / 运行时包加载 / 插件沙箱**（同 `post-mvp-planning.md:179`）。
4. **打开封闭的 `DestinationKind` 枚举为开放字符串**（ADR 0002 明确保持封闭）。
5. **文件系统自动发现 / glob import adapter**（ADR 0002 明确「不做」）。
6. **adapter 自定义字段类型、自定义 redaction DSL、用户 JavaScript / JSONPath / 模板表达式**（ADR 0002
   明确封闭）。
7. **Provider 侧贡献体验**：provider 与 destination 共享同一模式，但本 PRD 只覆盖 destination。provider
   对齐（例如 provider test-kit / scaffold）作为后续独立增量重新认领。
8. **Urgency channel adapter 的 scaffold / 贡献面**（`packages/destinations/src/urgency/` 是第三类 adapter，
   不在本方向）。
9. **跨 `configVersion` 的自动 config 迁移框架**（ADR 0002 已把迁移列为 adapter 可提供的纯函数 + console
   执行，本 PRD 不改该分工）。
10. **per-destination rate limit / concurrency 的 manifest 化**（ADR 0002 明确不在 MVP）。

## Acceptance Criteria

### 基线（当前实测，用于对照）

| 指标 | 当前值 |
| --- | --- |
| 新增 adapter 必须改动的文件数 | **≈20**（6 adapter-local + ≈14 跨包/console） |
| `apps/console` 侧必须改的文件数 | **≈9** |
| 其中 fail-silent 的站点 | **2**（`destination-form.tsx` 下拉、`BindingSelectorCases`）；portable export 已改为穷尽 switch |
| adapter-local LOC 参考（slack） | schema 20 + manifest 50 + payload 90 + adapter 100 + index 4 = **264**（另测试 523） |
| `send()` 中与业务无关的 boilerplate | 约 **80 行 / kind** |
| 复制的 `DestinationSendInput` fixture | **4 份** |
| destination registry audit | **已存在**（`packages/destinations/src/registry.ts:83`，测试强制零 warning） |
| contributor guide / checklist / scaffold | **已存在**（`docs/contributing/destination-adapter.md`、`scripts/new-destination-adapter.mjs`） |

### 验收标准（可测量）

- **AC1 — 覆盖面无 console**：新增一个 HTTP destination adapter，需要改动的文件数 **≤4**
  （`manifest.ts` / `adapter.ts` / `index.test.ts` + `package.json` 的 exports 一行），且**零个
  `apps/console` 文件**。
- **AC2 — 步骤数**：从 scaffold 到"console 里可配置、可预览、可投递"**≤6 步**，且前 4 步不涉及 console
  （scaffold → 改 manifest → 写 render → 跑自测 → registry 加一行 → 跑 audit）。
- **AC3 — 无静默缺口**：新增 kind 后，所有必须处理的站点由 **TS 编译失败或 audit 测试失败**兜住；
  `config-portability.ts:286` 的 `: []` 兜底被消除（改为 exhaustive 或从 manifest 派生）。
- **AC4 — fixture 去重**：4 个现有 destination 测试不再各自定义 `DestinationSendInput` 字面量，改用
  test-kit；仓库内该类字面量重复数 **下降 ≥90%**。
- **AC5 — 信封收敛**：HTTP destination 的 `send` 信封 boilerplate 从 ~80 行/kind 降到 **≤20 行/kind**；
  `slack` / `email` / `generic_webhook` 三个 adapter 完成迁移，且**全部现有测试保持绿**（行为等价）。
- **AC6 — audit 覆盖**：`packages/destinations/src/registry.ts` 存在 `audit()`，覆盖
  `sensitive`↔`secretFields` 对齐、enum↔registry 一致、manifest message key 存在、catalog 不含
  `secretFields`/`configSchema`、`defaultValue`↔schema 默认一致；测试强制通过，且对既有 4 个 adapter
  **零 warning**。
- **AC7 — 单一真相**：`DestinationKindSchema` / registry / console kind 下拉 / `DestinationFormKind` /
  `BindingSelectorCases` 中不再有独立维护的 kind 列表（console 从 catalog 派生）；新增 kind 不改
  `destination-kind-icon.tsx`，`iconName` 生效且缺失 asset 有 fallback。
- **AC8 — 交付物存在且被守护**：存在 `docs/contributing/destination-adapter.md`（或等价）与 scaffold
  命令；文档中的示例代码在仓库内**可编译**（例如由测试或 typecheck 覆盖），避免文档漂移。

## Open Questions

1. **HTTP 信封收敛的抽象边界（C6）**：框架接手 pipeline 后，非 HTTP transport（未来 SMTP）与 feishu 的
   特殊成功判据（须 `responseBody === "ok"`）怎么办？倾向 `HttpTransport.define` 作为**便捷层**、保留
   `send` 全权覆盖，而不是把 pipeline 做死。需在实现前定稿，否则可能变成新的抽象债。
2. **manifest-driven 表单的迁移策略（C2）**：一次性迁移 slack / generic_webhook / email，还是按 ADR 0002
   的 tracer bullet 先落一个 kind？且 feishu 的 app / urgent / builtin-card 复杂度是否意味着它**永久**保留
   feature override——若如此，"manifest-driven" 就只是部分覆盖，需要 amend ADR 0002 的那句"复杂表单作为
   feature module 里的 override 存在"来明确边界。
3. **"第三方贡献"的确切定义**：本 PRD 假设贡献者是"向本仓库提 PR 的人（可能在 fork 或内网私有部署）"，
   因此完全落在 ADR 0002 边界内。若产品真正想要的是"自托管用户**不 fork** 就能加私有 adapter"，那才触及
   ADR 0002 的边界，需要**独立 ADR** 讨论——本 PRD 不覆盖，也不应被解读为支持该做法。
