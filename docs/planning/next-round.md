# 下一轮工作决策备忘（Next Round Decision Memo）

> **状态：已过期存档（2026-10-20）。** 基线 `2f48153` 截至 2026-10-22 已落后 main 296 个提交
> （以 `git rev-list --count 2f48153..origin/main` 为准），正文中的
> S0 脱敏、registry audit、变量面板 D2/D5 等缺口均已交付。本文只保留历史决策背景，
> **不要按 §3 直接执行**；当前待办以 `docs/planning/iteration-backlog.md` 与
> `docs/planning/iteration-log.md` 为准。

- 基线：`origin/main` @ `2f48153`（第 9 轮迭代合并后）；工作树由自主迭代 routine 按轮重建，
  见 `docs/planning/iteration-log.md`
- 状态校正（2026-10-18）：S0 已由 `a460a6f` 修复（`config-portability.ts:358-370` 的穷尽
  switch 会让新 kind 编译失败而不是静默漏脱敏）；route explain、destination registry audit、
  adapter test-kit 与 console 的 `iconName` 消费也已落地。
  本文是历史决策备忘，续做前请按当前 `origin/main` 与 `docs/planning/iteration-backlog.md` 复核。
- 性质：**决策备忘，不是执行任务。** 本文只回答「下一步做什么、按什么顺序、谁来做、卡在哪」。
- 输入文档（第一轮设计产出，均在 main 上）：
  1. `docs/research/route-authoring-current-state.md`（Route Explain 现状 + 候选切片 A/B/C）
  2. `docs/prd/alert-suppression.md`（抑制 PRD + 3 条 Open Questions）
  3. `docs/research/template-editor-ux-review.md`（模板编辑器 UX + 5 个改进切片 + 5 条开放问题）
  4. `docs/prd/adapter-contribution-experience.md`（adapter 贡献体验 + 8 项框架能力 C1–C8 + 摩擦点 F1–F8）
- 路线图：`docs/prd/post-mvp-planning.md`（方向 2 = Route Authoring 第二优先；方向 3 = Suppression 第三优先；方向 6 = Adapter 贡献体验）
- 核实方式：本文对候选切片的**影响面与风险**均基于上述四份文档的 `文件:符号` 证据；对安全缺口做了**独立代码核实**（见 §1.1），并额外核对了文档未主张的可行性前提（见 §1.2）。

---

## 0. 一句话结论

**先堵安全兜底，再兑现「信任」这一条产品主线（Route Explain A → B），最后才碰新能力（Suppression）。**
Suppression 是唯一一件**必须等人拍板才能开工**的大件，所以它的 3 条 Open Question 应当**今天就推给人**，但不该让它占住这一轮的实现带宽。

---

## 1. 候选工作盘点

### 1.1 安全缺口核实结论：**成立**（且比 PRD 描述的更值得优先）

**核实对象：** `apps/console/src/server/configuration/config-portability.ts:286` `destinationSecretPaths`。

PRD `docs/prd/adapter-contribution-experience.md` 的 F2 主张：该函数用嵌套三元、末尾兜底 `: []`，新增 kind 会静默落进空分支，无 TS 报错。**代码核实结论如下，全部成立：**

1. **嵌套三元与 `: []` 兜底确实存在。** `config-portability.ts:286-296`：

```ts
const paths: string[] =
  destination.kind === "generic_webhook" ? ["url"] :
  destination.kind === "feishu"        ? ["webhookUrl", "signSecret"] :
  destination.kind === "slack"         ? ["webhookUrl"] :
  destination.kind === "email"         ? ["endpointUrl"] :
  [];   // ← 新增 kind 落这里，无 TS 报错
```

2. **无 TS 守卫，且这不是笔误而是一处孤例。** 同类的逐 kind switch 在
   `apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts:268` 与 `:286`
   **都有** `const _exhaustive: never = kind` 兜底；`config-portability.ts:286` **没有**。
   全仓 `_exhaustive` 仅两处命中（`grep -rn "_exhaustive"` = 2 个 switch 语句），**都在 helpers 里** ——
   即 `config-portability.ts:286` 是唯一一处「漏了新 kind 也编译通过」的分派点。
   另需注意：新增 kind 时必须同时改 `packages/core/src/destination/destination.ts:7` 的
   `DestinationKindSchema`，所以**其他** switch 会因枚举扩张而 fail-loud；**唯独这一处不会**。

3. **兜底为空时，脱敏只剩 key 名启发式 —— 而启发式覆盖不到 `url` / `endpointUrl`。**
   两条脱敏路径是串联的：`omitJsonPaths(omitSensitiveJson(config), secretPaths)`（`:274`）。
   `omitSensitiveJson`（`:322`）逐 key 调 `isSensitiveKey`（`packages/core/src/redaction.ts:16`）。
   我用该正则的精确内容实测：

   | key | `isSensitiveKey` | 说明 |
   |---|---|---|
   | `webhookUrl` / `signSecret` | **覆盖** | 在 `SENSITIVE_KEY_PATTERN` 白名单里 |
   | `url` | **不覆盖** | ← generic_webhook 的真实 secret 字段 |
   | `endpointUrl` | **不覆盖** | ← email 的真实 secret 字段 |

   即：一旦 secretPaths 为空数组，`url` / `endpointUrl` 这类「URL 里内嵌 bearer token」的字段
   **会被原样写进可移植配置**（TOML/JSON 导出）。这不是理论问题：`slack/manifest.ts:37` 等四个
   manifest 的 `secretFields` 都把 URL 当作 kind 为 `webhook_url` 的 secret 声明，
   说明「URL 即凭据」是这个产品的既有共识。

4. **这条路径无第二道防线。** `packages/core/src/config.ts:60` 的 `ConfigDestinationSchema`
   把 `config` 声明为自由形态的 `JsonObjectSchema`，schema 层不会为任何 kind 强制脱敏。
   `packages/destinations/src/registry.ts` **没有 audit**（`grep -c audit` = 0，对照
   `packages/providers/src/registry.ts` = 10），因此也没有 registry 级校验能兜住。

5. **测试也兜不住。** `configuration.integration.test.ts:975` / `:1024` 的 «exports portable TOML/JSON
   without plaintext secrets» 断言只用了 `kind: "slack"`（`:985`、`:1034` 附近），
   而 slack 恰好走显式分支、`webhookUrl` 又恰好在启发式白名单里 —— 这是「恰好双重覆盖」的用例，
   对新增 kind 零保护。全仓没有按 `DestinationKindSchema.options` 参数化的脱敏测试。

**判断：这是「当前不可利用、但一旦有人加 kind 就静默泄露」的潜伏缺陷。**
现状四个 kind 的 secret 都在显式列表里，所以**今天没有实际泄露**；但本轮 PRD（C1–C8）的目标恰恰是
**降低新增 adapter 的门槛** —— 门槛越低，踩中这个缺口的概率越高。**降低摩擦之前必须先装护栏**，
否则「让贡献变容易」会直接把一个静默泄露路径变宽。因此我把它排在所有工作之前。

**修复代价很低（这是它能排第一的第二个理由）：** `ConfigPortabilityServiceOptions` 已经持有
`DestinationRegistry`（`config-portability.service.types.ts:5-9`），
即 `destinationSecretPaths` 需要的数据在调用点**已在手边**，无需新增依赖或改装配 —— 改成从
`adapter.manifest.secretFields[].path` 派生（PRD 的 C4）是一次局部重构，不是架构变更。

### 1.2 文档未主张、但我另行核实的可行性前提

排序若只信文档会漏掉两件事，这里一并核实，以免推荐排在「既无阻塞也无前置」的假象上：

- **§3 步骤 2 的 B 切片（投递缺口解释）真的不用改写入路径吗？** 是。
  `history.repository.ts:131` 的 `event.routeMatches ?? …` 说明解释数据在读取侧组装，
  `delivery.repository.ts:195` 的 `claimNext` 也已是只读查询；命中侧（`events.route_matches_json`）
  与投递侧（`deliveries.route_id`）都在读取时可见，B 可作为**只读解释**先落地。文档结论可靠。
- **§3 步骤 1 的修复能否在没有 registry 改动的前提下完成？** 能。见 1.1 第 5 点：
  调用点已注入 `DestinationRegistry`，`manifest.secretFields` 在 server 侧可直接读。
  这意味着**步骤 1 不与 C1/C2/C3 串行**，可以独立开工。

---

### 1.3 候选切片总表

影响面 / 风险均为相对刻度；「阻塞于人的决策」指**开工前**就必须有人拍板，而非实现中的技术选择。

| # | 切片 | 来源文档（章节） | 预估影响面 | 风险 | 阻塞于人的决策 |
|---|---|---|---|---|---|
| **S0** | **消除 `destinationSecretPaths` 静默漏脱敏**（改为从 `manifest.secretFields` 派生 / 或补 `_exhaustive` 守卫） | adapter PRD §摩擦点 F2、§能力 C4、AC3 | **小**：`config-portability.ts` 1 个函数 + 可能 1 个测试 | **安全**。修晚了会让 C1–C8 的新 kind 直接踩中；修错方向（漏一条 path）同样泄露 → 需参数化测试 | **否** |
| **A** | Route Explain 运维可读化：check 带出**事件实际值** + 本地化 + 标注证据**产生时刻**（接入快照 / 现状重算） | route-research §候选切片 A、§4.2 缺口 1/3/4 | **中**：core detail 文案 + `event-detail-route-matches-table.tsx` + history 读取侧的来源标记 | **低**。纯读路径，不动匹配引擎/写入/持久化。老快照文案兼容是唯一细节 | **否** |
| **B** | 投递缺口解释：命中但未投递的**原因分类**（幂等去重 / 已存在 / 目标禁用 / route 已禁用） | route-research §候选切片 B、§4.2 缺口 2/5 | **中**：history 读取侧关联 `deliveries` + Event detail 展示位 | **低-中**。只读解释；但「去重/跳过计数当前不落库」（§4.3）意味着**部分原因无法完全还原**，需先界定可解释边界 | **否**（但需明确定界） |
| **C** | 多条件规则的可编辑性与快照一致性（每类条件的**全部**条目可查看/编辑） | route-research §候选切片 C、§4.2 缺口 6 | **中-大**：`features/routes/**` 表单模型（`route-forms.tsx` 707 行）+ `route-edit-restricted-notice.tsx` | **中**。`replaceFirstCondition`（`route-form.ts:154`）语义改动会触碰已钉死的 7 个表单测试；多条件实际占比未知（文档「未确认」） | **否** |
| **D1** | 模板编辑器：草稿注入改**显式动作**（消除切模式静默改写）+ 空/非空语义文案 | ux-review §1、§切片 2 | **中**：`destination-form.tsx` + `model/destination-form.ts` + 2 i18n + **2 个既有测试需改** | **中-高**。会被测试钉死的行为（「restores the default Feishu card template」）；**会改变默认投递行为**（`templateCard` 默认值改空） | **是**（开放问题 1：空 body 语义；开放问题 5：草稿是否持久化） |
| **D2** | 模板编辑器：变量面板分组 + 过滤 + 常用行（45 → ~20 项） | ux-review §2、§切片 1 | **小-中**：新建 `template-variable-panel.tsx` + `destination-form.tsx` + 2 i18n | **低**。纯前端 4 文件，不动 server/package，是**验证成本最低**的一片 | 否（开放问题 4 影响形状，不阻塞开工） |
| **D3** | 模板编辑器：诊断回填编辑器（行号 + `did you mean` + 不再只留在预览 JSON tab） | ux-review §3、§切片 3 | **中**：5 个前端文件；需要「预览结果回传表单」这一处架构改动 | **低-中**。数据链路已存在且有测试固定（`configuration.integration.test.ts:506,821`），缺的只是呈现 | 否 |
| **D4** | 模板编辑器：模式选择器可发现性（单模式也渲染 + Email 三槽说明 + `help` 补齐） | ux-review §4、§切片 4 | **中**：2 个前端文件 + `packages/destinations` 4 个 manifest + i18n | **低**。但 `packages/destinations` 的 manifest 改动要注意 `registry.test.ts` 守卫 | **是**（开放问题 2：Email 两槽是否升为模式 → 若是则是数据模型变更，需重开 ADR） |
| **D5** | 模板编辑器：无障碍（组命名 + 错误关联 `aria-describedby` + **按光标插入**） | ux-review §5、§切片 5 | **小-中**：3 个前端文件 + `components/ui/field.tsx` + 1 测试 | **低-中**。但「按光标插入」是**功能性缺陷**（当前无条件产生非法 JSON，见 ux-review §5 问题 3）；改它会打破 `destination-form.test.tsx:88` 的既有断言 | 否 |
| **E1** | 抑制：领域模型 + 匹配判定 + `suppressed` 投递状态 + 执行期二次校验 | suppression PRD §2.1/2.4/2.6、AC | **大**：新表 + `deliveries` 扩展 + `DeliveryStateSchema` 扩枚举 + **worker 热路径二次校验** | **高**。唯一触及执行热路径的切片（PRD §Implementation Decisions）；扩 `DeliveryStateSchema` 要保证四个既有状态零回归 | **是**（OQ1 加急 bypass；OQ2 `endsAt` 是否可空） |
| **E2** | 抑制：可审计证据（`suppress_reason` 快照 + 规则删除后仍可读 + 双向可查） | suppression PRD §2.5、AC | **中-大**：依赖 E1 的落库字段 | **中**。快照与规则生命周期解耦是关键设计点，做错则审计失效 | **是**（随 E1 的 OQ1/OQ2） |
| **E3** | 抑制：创建/启停/过期 UI + **加急影响范围预览** | suppression PRD §2.3、故事 19、AC | **中-大**：新 oRPC namespace + 新 UI 面 | **中**。「按下静默前看到会让 X 个目标不打电话」是本次 PRD 的安全护栏，不可省 | **是**（OQ3 是否发摘要） |
| **F1** | Adapter：kind 单一真相（消除 4 份并行枚举） | adapter PRD §C1、§F1、AC7 | **中**：console kind 下拉 + `DestinationFormKind` + `BindingSelectorCases` 改为读 catalog | **低-中**。服务端已暴露 `toCatalog()`；但前端从同步常量改为读异步 catalog 是有状态改动 | 否 |
| **F3** | Adapter：destination registry `audit()`（对齐 providers） | adapter PRD §C3、§F6、AC6 | **中**：`packages/destinations/src/registry.ts` + 测试 | **低**。ADR 0002 已写明该方法应存在，是**执行既有决策**，不需 amend | 否 |
| **F2'** | Adapter：manifest-driven 表单渲染（3 种字段类型 → 通用 renderer） | adapter PRD §C2、§F3 | **大**：1249 行 `destination-form.tsx` + 751 行 `model/destination-form.ts` | **高**。最大改动面；feishu 是否永久保留 override 未定，边界不清会造抽象债 | **是**（OQ2：一次性迁移还是 tracer bullet；feishu 边界） |
| **F4** | Adapter：test-kit（`destinationSendInput` / `fakeFetch`，消除 4 份复制 fixture） | adapter PRD §C5、§F4、AC4 | **小-中**：新增子路径导出 + 迁移 4 个测试 | **低**。纯测试基建，行为等价可验证 | 否 |
| **F5** | Adapter：HTTP 发送信封收敛（~80 行/kind → ≤20 行） | adapter PRD §C6、§F5、AC5 | **中**：3 个 adapter 迁移 | **中**。可能变成新抽象债（PRD OQ1 自己点了这个风险） | **是**（OQ1：抽象边界定稿） |
| **F6** | Adapter：contributor guide + scaffold + checklist | adapter PRD §C7、§F8、AC8 | **小**（文档）但需**持续维护** | **低**，但 AC8 要求文档示例代码可编译，否则必然漂移 | 否 |
| **F7** | Adapter：`iconName` 真正生效（消除「假能力」） | adapter PRD §C8、§F7、AC7 | **小**：`destination-kind-icon.tsx` 改按 catalog 映射 + fallback | **低**。删除硬编码 switch | 否 |

**关于「路线图对照」：** 路线图把 Suppression 列为第三优先、Adapter 贡献体验列为方向 6 —— 但那是
**做哪个方向的排序**（`post-mvp-planning.md:203` 给 Route Authoring 的第二优先理由是「提升用户对告警路由的信任」）。
本备忘要排的是**跨方向的切片顺序**，因此不照抄方向序号：S0 来自方向 6，却排在方向 2 之前，
理由是它是**安全缺口**，而排序原则第一顺位是「安全 > 用户信任 > 新能力」（见 §3）。


## 2. 依赖与阻塞分析

### 2.1 必须先等人拍板才能开工（硬阻塞）

| 阻塞项 | 卡住谁 | 来源 |
|---|---|---|
| 抑制 PRD **OQ1**：加急电话是否需要 bypass 逃逸口 | **E1**（判定语义）、**E3**（UI 护栏） | `alert-suppression.md` §Open Questions 1；§2.3 默认答案是「不」，但 PRD 自己标注「属于安全边界决策，需要人拍板」 |
| 抑制 PRD **OQ2**：`endsAt` 是否允许为空 | **E1**（schema 必填性）、**E2**（过期投影）、**E3**（列表强提醒） | 同上 OQ2。若允许无期限，「遗忘的静默黑洞」防护设计完全不同 |
| 抑制 PRD **OQ3**：窗口结束是否发「静默了 N 条」摘要 | **E3**（是否多一类通知聚合） | 同上 OQ3。PRD 自评「可能是独立切片的工作量」 |
| 模板 UX **开放问题 1**：空 body 是否继续表达「使用默认信封」 | **D1**（形状完全不同：文案 vs 显式开关 + 草稿模型改动） | `template-editor-ux-review.md` §开放问题 1 |
| 模板 UX **开放问题 5**：草稿是否需要跨会话持久化 | **D1**（决定是否引入额外存储层） | 同上 OQ5 |
| 模板 UX **开放问题 2**：Email 的 subject/html 两槽是否升为模式 | **D4**（若「是」则是数据模型变更，需重开 ADR 0010） | 同上 OQ2 |
| Adapter PRD **OQ1**：HTTP 信封收敛的抽象边界（非 HTTP transport / feishu 特殊成功判据） | **F5** | `adapter-contribution-experience.md` §Open Questions 1，PRD 自评「需在实现前定稿，否则可能变成新的抽象债」 |
| Adapter PRD **OQ2**：manifest-driven 表单迁移策略 + feishu 是否永久保留 override | **F2'**（且可能需 amend ADR 0002） | 同上 OQ2 |

**注意一道隐含的耦合：** 抑制 PRD 的 OQ1/OQ2 不解决，不只是 E1 不能开工 ——
它们同时决定了 `suppressions` 表结构（OQ2 决定 `ends_at` 的可空性）与 `suppressed` 状态机的语义
（OQ1 决定「被抑制的加急」是否可被绕过）。**表结构一旦落地再改，就要付迁移成本。**
所以这三条 OQ 是真正的「开工前」阻塞，不是「实现中再定」。

### 2.2 可以直接开工、无阻塞

- **S0**（安全兜底）：无阻塞。且已核实**不与 C1/C3 串行** —— `DestinationRegistry` 已注入
  `ConfigPortabilityService`（`config-portability.service.types.ts:5-9`），可从 `manifest.secretFields` 派生。
- **A**（Explain 可读化）：无阻塞。纯读路径。
- **B**（投递缺口解释）：可开工，但需先界定**可解释边界**（见 2.4 注）。
- **D2 / D3 / D5**：无阻塞（D5 的「按光标插入」会打破既有测试，属可控）。
- **F1 / F3 / F4 / F6 / F7**：无阻塞。

### 2.3 必须串行的依赖链

1. **A → B（强串行）。** `route-authoring-current-state.md` §候选切片 B 明确写：
   「**依赖切片 A** —— 两者共用同一块『解释证据』展示位与文案通道，B 在 A 之上扩展维度；
   先做 B 会立刻撞上 A 未解决的英文/实值问题。」**采纳该判断。**
2. **E1 → E2 → E3（强串行）。** E2 的 `suppress_reason` 快照依赖 E1 落库的三个字段；
   E3 的 UI 依赖 E1 的状态投影与 E2 的展示契约。
3. **F3 → F2'（F3 是 F2' 的安全网）。** F2' 要动 1249 行表单与 per-kind 映射；
   `audit()`（F3）是唯一能自动发现「新 kind 漏了某站点」的机制。**先有网，再拆墙。**
4. **C 与 A/B 并行，互不阻塞**（`route-authoring-current-state.md` §候选切片 C 明确：
   「与 A / B 并行，互不阻塞」）。
5. **S0 与一切并行**（影响面仅 1 个函数，且已确认无装配前置）。
6. **F1 / F4 / F7 可并行**，都是低风险的独立小件。

### 2.4 一处需要现在就记录的口径风险

`route-authoring-current-state.md` §4.3 记录：**「被去重 / 被跳过的证据」不存在持久化字段**
（仅在 API 返回值里）。这意味着 **B 切片无法 100% 还原「为什么没投递」** ——
幂等去重与 `skippedExisting` 的计数不落库，只能从现有记录**推断**。

**判断：不应为了 B 去改 `enqueueForEvent` 的落库行为。** 理由：那会触碰接入热路径与既有写入契约，
把一片「只读解释」升级成「写入变更」，风险与收益不匹配。**正确做法是在 B 的可交付物里明确写出
「可解释」与「不可解释」两类原因的边界**，让 UI 诚实标注「未投递且原因不可还原」，
而不是假装能解释一切。这与抑制 PRD §2.5「被抑制的投递必须有明确状态与原因」是同一条信任线。


## 3. 推荐执行顺序（未来 5 步）

### 3.0 排序原则（我采用的，及为什么）

四条原则，**按优先级从高到低**，冲突时上位覆盖下位：

1. **安全 > 用户信任 > 新能力。** 静默泄露凭据这类缺陷，其成本不随「暂时没触发」而降低 ——
   它是一颗定时炸弹，且本轮计划正在**主动降低引爆门槛**。
2. **已解锁的依赖优先。** 若一件事 A 不做就会让后续 N 件事重做，A 必须提前。
   S0 之于 C1–C8、A 之于 B、F3 之于 F2' 都属此类。
3. **先做影响面小、能快速验证的。** 用低风险交付换取对下一轮方向的信息量（learning by shipping）。
4. **诚实面对「必须等人」的事：让它并行排队，不要占住实现带宽。**
   抑制是唯一的硬阻塞大件，所以正确答案是**今天就把它推给人拍板**，而不是让它空转挡住其他工作。

**我不采纳的做法：** 直接照抄路线图方向序号（Suppression 第三 → 排在 Route 之后）。
理由：路线图排的是**方向**，本备忘排的是**切片**；而 `S0` 证明同一方向内部的切片优先级可以颠覆方向优先级。
方向 6 里藏着一条安全缺口，这一点在路线图的粒度上看不见。

---

### 步骤 1 — S0：堵住 `destinationSecretPaths` 的静默漏脱敏

- **做什么：** 把 `config-portability.ts:286` 从嵌套三元改为**从 `adapter.manifest.secretFields[].path` 派生**
  （即 PRD 的 C4），或至少补 `_exhaustive: never` 守卫使其 fail-loud；
  并补一个**按 `DestinationKindSchema.options` 参数化**的脱敏回归测试
  （现有测试只覆盖 slack，是「恰好双重覆盖」的用例，见 §1.1 第 5 点）。
- **为什么排第一：** 唯一的**安全类**缺口，且我已独立核实成立（§1.1）。
  更关键的是**时序理由**：这一轮的 F1/F2'/F3 全部在**鼓励新增 adapter**，
  门槛一降，踩中该缺口的概率就上升。**降低摩擦之前必须先装护栏。**
  同时它影响面极小（1 个函数 + 1 个测试）、无装配前置、无阻塞 ——
  是「高价值 × 低成本 × 高紧迫」三者齐备的唯一一项。
- **派给谁：** **主调度者亲手实现**（developer 亦可）。理由：单函数 + 单测试，
  沟通开销大于实现开销；且改的是脱敏逻辑，**交接成本本身就是风险**，不传手更安全。
  但**验收必须交给 `evaluator`**：安全修复不能自己判自己过 —— 需要独立验证
  「新 kind 现在会自动获得正确脱敏路径」以及「既有四个 kind 行为零回归」。
- **完成定义：** 新增一个假 kind 时（临时测试桩）脱敏路径**自动正确或被编译拦住**，两者之一。

### 步骤 2 — A：Route Explain 运维可读化

- **做什么：** 在既有 `events.route_matches_json` 快照之上，让每条 check
  **带出事件里的实际值**、本地化呈现、并**明确标注证据产生时刻**（接入快照 / 现状重算）。
  即 `route-authoring-current-state.md` §候选切片 A —— 直接闭环该文档列出的问题 2、3、4。
- **为什么排这里：**
  - **是「用户信任」主线的第一块砖**，而路线图给 Route Authoring 第二优先的理由正是
    「提升用户对告警路由的信任」（`post-mvp-planning.md:203`）。
  - **它解锁 B。** 文档明说「先做 B 会立刻撞上 A 未解决的英文/实值问题」——
    即不做 A 就做 B，B 的产出会立刻过时，返工成本高于串行等待。
  - **数据源已在、且已在 UI 渲染**，只改「可读性与来源标注」一条链路：
    不碰匹配引擎、不碰写入路径、不新增持久化 —— 是**低风险的中等交付**。
- **派给谁：** **`designer` 先出文案与呈现**（detail 的中文运维措辞 + 「产生时刻」如何标注得不刺眼），
  随后 **developer 实现**。理由：这一片的核心难点不是代码而是**措辞与语义的可信度**
  （「当时真相」vs「现在算的」必须一眼可辨，否则等于没修），属设计判断优先。
- **注意：** §4.2 缺口 3 的 `routeMatches ??` 回填（`history.repository.ts:131`）是**读取侧**
  的问题，改它不涉及数据迁移 —— 这是 A 能保持低风险的关键，实现时务必守住这条边界。

### 步骤 3 — B：投递缺口解释（A 完成后立即串行）

- **做什么：** 为每条命中 route 展示它与 `deliveries` 的对账结果，给出未投递原因分类，
  并**显式标注哪些原因当前不可还原**（见 §2.4）。
- **为什么排这里：** 依赖 A（共用展示位与文案通道）；且它闭环的是最刺眼的两个用户问题
  （「命中 1 条路由为什么 0 投递」「显示命中为什么永不投递」）——
  这两条直击**「我还能不能信这个系统」**，是比任何新能力都更值钱的修复。
- **派给谁：** **`product-manager` 先定「可解释边界」**（哪些原因写进 UI、哪些标为不可还原），
  再交 **developer 实现**。理由：这一片的真实风险是**过度承诺**
  —— 若把「推断」伪装成「事实」，等于在信任线上造假，比不做更糟。这是产品判断，不是技术判断。
- **依赖提醒：** 不要为了解释力去改 `enqueueForEvent` 的落库行为（理由见 §2.4）。

### 步骤 4 — 并行小件批次：护栏 + 低成本验证（F3、D2、D5-光标插入）

- **做什么（一批可并行的独立小件）：**
  - **F3** `packages/destinations/src/registry.ts` 的 `audit()` —— **这是 F2' 的安全网**（§2.3 第 3 条）。
  - **D2** 模板变量面板分组 + 过滤（45 → ~20 项）：纯前端 4 文件、不动 server/package，
    是**性价比最高的验证性交付**。
  - **D5 的「按光标插入」子项单独抽出** —— ux-review §5 问题 3 指出当前实现
    **无条件产生非法 JSON**，这是功能性缺陷而非无障碍问题，应比其余 D 切片更早。
- **为什么排这里：** 原则 3（影响面小的先做以快速验证）。这一批全是低风险、可并行、无阻塞，
  适合在 A/B 的实现带宽之外同时推进，用来**积累交付节奏**而不是等一个大件。
- **派给谁：** **developer 并行**；F3 的 audit 规则清单可先由 **`researcher`** 从
  `packages/providers/src/registry.ts:88` 的既有 audit 逐条对齐（避免重新发明规则）。
- **不要放进这批的：** F2'（manifest-driven 表单）与 D1（草稿注入）—— 前者风险过高且阻塞于 OQ2，
  后者会改变默认投递行为且阻塞于开放问题 1/5。

### 步骤 5 — 抑制：先拍板，后开工（E1 → E2 → E3）

- **做什么：** 按 PRD 的 E1（领域模型 + 判定 + `suppressed` 状态 + **执行期二次校验**）→
  E2（可审计证据）→ E3（UI + 加急影响范围预览）串行推进。
- **为什么排最后（而不是因为它不重要）：**
  - 它是**唯一必须等人拍板**的大件：OQ1/OQ2 直接决定表结构，**现在开工就是在赌一个可能要迁移的 schema**。
  - 它的风险等级是全表最高：**唯一触及 worker 执行热路径**，且要扩 `DeliveryStateSchema`
    这种被四个既有状态钉死的基础枚举 —— 需要最充分的准备。
  - 它是**新能力**，在原则 1 的排序下排在安全与信任之后。
- **但「今天就要做的动作」不是实现，是产出决策材料：** 把 OQ1/OQ2/OQ3 变成一页
  「决定什么 / 两个选项的后果 / 推荐值」交给拍板人。
- **派给谁：**
  - **`planner`（或 `product-manager`）** 现在就写那份**决策材料**（不写代码）。
  - 拍板后：**developer 实现 E1**，其中**执行期二次校验**（`delivery-execution.ts` 附近）
    必须先由 **`evaluator` 明确验收标准**再动手 —— 这是唯一改热路径的地方。
  - **E3 的加急影响范围预览**（PRD 故事 19）建议交 **designer**：
    它是本 PRD 里唯一「让运维在按下静默前理解后果」的安全护栏，措辞与呈现质量直接决定它是否有效。

---

### 3.1 顺序总览

| 步骤 | 切片 | 前置 | 承担者 | 可否与其他步并行 |
|---|---|---|---|---|
| 1 | **S0** 安全兜底 | 无 | 主调度者实现 + `evaluator` 验收 | 是（不阻塞任何事） |
| 2 | **A** Explain 可读化 | 无 | `designer` → developer | 是（可与 C、D2、F3 并行） |
| 3 | **B** 投递缺口解释 | **A（强串行）** | `product-manager` → developer | 否，紧跟 A |
| 4 | **F3 + D2 + D5(光标插入)** 护栏与小件批次 | F3 无；D2/D5 无 | developer（F3 可先 `researcher` 对齐规则） | 是，本批内部互相并行 |
| 5 | **E1 → E2 → E3** 抑制 | **OQ1/OQ2 拍板；F3 的 audit 已就位更好** | `planner` 出决策材料 → developer（E3 加急护栏交 `designer`） | 内部串行，整体可与 2/4 并行 |

**「未来 3-5 步」的读法：** 步骤 1–3 是**必须走的信任主线**（安全 → 信任 → 信任的可解释性），
步骤 4 是**可并行的护栏与快验证批次**，步骤 5 是**等拍板的新能力**。
若只有 3 步的预算，走 1→2→3；若有人力并行，1/2/4 可同时开，3 紧跟 2。


## 4. 需要人拍板的事项清单

共 **9 条**。每条一句话说清「要决定什么、不决定的后果」。按紧急度排序：前 3 条决定**表结构**，
越晚改代价越高；后 6 条主要卡住各自切片的**形状**。

### 阻塞 E1/E2/E3（抑制）—— 决定 schema，必须最先拍

1. **加急电话是否需要 bypass 逃逸口（例如 P0 事故时即使维护窗口开着也叫醒人）？**
   PRD 默认「不」。**不决定的后果：** 抑制判定语义无法定稿，
   `suppressed` 状态机是否需要一个「可被绕过」的维度悬空，E1 无法开工。
2. **`endsAt` 是否允许为空（长期静默）？**
   **不决定的后果：** `suppressions.ends_at` 的可空性与「遗忘的静默黑洞」防护设计
   （列表置顶 / 定期提醒）都无法定稿，而这是**建表时就要定的字段**，事后改要付迁移成本。
3. **窗口结束要不要发一条「维护期间静默了 N 条告警」的摘要通知？**
   （v1 不做 / 只做 UI 汇总视图 / v1 就发通知）
   **不决定的后果：** E3 是否需要一块跨投递聚合 + 一类新通知的工作量无法估算，
   排期可能整体偏小；若选「v1 就发」还涉及是否复用现有 destination 通道。

### 阻塞 D1/D4（模板编辑器）—— 决定切片形状

4. **「空 body」是否继续表达「使用默认信封」，还是要变成一个显式开关？**
   **不决定的后果：** D1 的形状完全不同（前者只需加空态文案；后者要动草稿模型），
   且会连带改变**默认投递行为**。
5. **模板草稿是否需要跨会话持久化？**
   **不决定的后果：** D1 是否需要引入额外存储层无法确定；
   现有 i18n key `destinations.form.templateDraftLoadError` 暗示了持久化意图，但实现只有内存态 ——
   这个不一致会持续误导使用者。
6. **Email 的 subject / html 两槽是否升为可见的模式？**
   **不决定的后果：** D4 若按「是」做就是**数据模型变更**，需重开 ADR 0010；
   若一直悬着，Email 的「三槽能力不可发现」问题会继续存在（ADR 自己已把它列为已知缺口）。

### 阻塞 F2'/F5（adapter 贡献体验）—— 决定抽象边界

7. **HTTP 发送信封收敛的抽象边界定在哪里？**
   （非 HTTP transport 如未来 SMTP、以及 feishu 的「响应体必须等于 `ok`」特殊成功判据怎么办）
   **不决定的后果：** F5 做出来可能是**新的抽象债**（PRD 自己点了这个风险），
   而不做则 AC5 无法达成。
8. **manifest-driven 表单渲染是「一次性迁移 slack/generic_webhook/email」还是「先落一个 kind」？
   且 feishu 的 app/urgent/builtin-card 复杂度是否意味着它永久保留 feature override？**
   **不决定的后果：** F2'（最大改动面，1249 行表单 + 751 行模型）的边界不清，
   且若确认永久部分覆盖，需 **amend ADR 0002** 那句「复杂表单作为 feature module 里的 override 存在」。
9. **「第三方贡献」的确切定义**：是「向本仓库提 PR 的人」，还是「自托管用户不 fork 就能加私有 adapter」？
   **不决定的后果：** 若是后者，就触及 ADR 0002 的边界，需要**独立 ADR**；
   本 PRD 明确不覆盖该做法，但若被误读为支持，方向会跑偏。

### 附：一条非「人拍板」但需要记录的判断

- **B 切片的「可解释边界」**（哪些未投递原因写进 UI、哪些标为不可还原）需要 `product-manager`
  定调，但不上升为人拍板 —— 它属产品口径，不涉及 schema 或架构边界（见 §2.4、§3 步骤 3）。


## 5. 一句话建议

**如果只能做一件事：立即修掉 `config-portability.ts:286` `destinationSecretPaths` 的静默漏脱敏兜底
（改为从 adapter manifest 的 `secretFields` 派生，并补一个按 `DestinationKindSchema.options`
参数化的脱敏回归测试）——因为这一轮的全部计划都在鼓励新增 adapter，等于在主动放大一个已存在的
凭据泄露路径。**

理由是它同时满足三个通常互斥的条件：**唯一的真实安全缺口**（已核实成立，见 §1.1）、
**影响面最小**（1 个函数 + 1 个测试，且所需 registry 已在调用点注入，无装配前置）、
**紧迫性随本轮计划递增**（门槛降得越低，踩中概率越高）。它是这份备忘里唯一「不做会变坏、
且越晚做越坏」的一项。

---

## 附：本文未覆盖的范围

- **不含实现方案。** 本文只做决策与排序；每个切片的 file-level 实现顺序应在拿到拍板结论后
  另立切片文档（对齐抑制 PRD §Further Notes 的做法）。
- **不含排期工时估算。** 影响面给了相对刻度，但未采集实例数据
  （如「多条件 route 在生产占比」——`route-authoring-current-state.md` §未确认 明确列为需实例数据，
  本次未采集）。若要做精确排期，C 切片与 D 系列的优先级需要这份数据支撑。
- **未采纳的候选：** 路线图方向 4（搜索/过滤/历史排障）与方向 5（自托管发布硬化）本轮四份文档
  均未产出候选切片，故不在盘点表内；它们的优先级判断需另立调研。

