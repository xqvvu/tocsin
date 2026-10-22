# PRD: On-call 加急（飞书电话呼叫）

> 状态：已交付（PR #32 飞书应用资源 + PR #35 加急队列与自动触发）。以下 Problem Statement
> 保留交付前的现状记录。

Labels: `ready-for-agent`

## Problem Statement

Tocsin 的投递能"通知"，但不能"叫醒"。告警进入飞书群或邮箱后，是否被看到取决于人有没有在看消息。夜班与 on-call 场景下这不成立：critical 告警会被静音的群消息淹没，值班人在睡觉，事故在无人响应里恶化。

飞书为自建应用提供加急能力：对一条应用已发送的消息，可以向指定用户发起电话呼叫（`urgent_phone`）、短信（`urgent_sms`）或应用内强提醒（`urgent_app`）。Tocsin 当前的飞书接入是自定义群机器人 webhook：响应里没有 `message_id`，也没有应用凭证路径，因此完全够不着这个能力。

另外，"应用凭证"本身缺少归宿：一个飞书应用会被多个告警群复用，凭证需要有独立的管理位置，而不是在每个通知目标里重复录入。

## Solution

三件事，互相独立但组合成完整能力：

1. **飞书应用成为可复用资源。** Operator 在 console 里登记一次应用（`app_id` / `app_secret`），可以测试连通、被多个通知目标引用；凭证按现有 secret 纪律保存，被引用时不能删除。
2. **飞书通知目标增加"应用发送模式"。** 目标可以引用一个已登记的应用 + 群 `chat_id`，卡片由应用发出，Tocsin 因此拿到这条消息的 `message_id`。webhook 模式保持原样，老配置零迁移。
3. **加急成为挂在某次投递上的动作（自动 + 手动）。** 目标上配置加急接收人与 severity 门槛后：命中的投递在发送成功时自动为每个接收人创建一条加急记录（ping），Tocsin 对这条投递自己的消息发起 `urgent_phone`；操作者也可以在投递详情页对某一次投递手动加急。

加急拥有独立的状态机、重试与去重，与卡片投递完全解耦：电话失败只重试电话，不重发群卡片；卡片重试也不会重复打电话。事件详情与投递详情能看到"谁被叫了、成没成"。

第一版只做电话加急、只做即时触发；排班、轮转、多级升级、确认与抑制不在范围内（见 Out of Scope）。

## User Stories

1. As an SRE, I want to register a Feishu app once with its `app_id` and `app_secret`, so that several alert groups can share one credential instead of duplicating it.
2. As an SRE, I want to test a saved Feishu app, so that I know the credential is valid before relying on it for paging.
3. As an SRE, I want to see which destinations reference an app, so that I can tell what a credential change affects.
4. As an SRE, I want a Feishu destination to send its card through the registered app, so that the message carries the identifier paging needs.
5. As an SRE, I want webhook-mode Feishu destinations to keep working unchanged, so that adopting paging does not force a migration of existing groups.
6. As an SRE, I want to configure urgent receivers and a severity gate on a Feishu destination, so that only the alerts worth waking someone for place a call, to the right people.
7. As an SRE, I want to turn automatic paging off while keeping manual paging available, so that a destination stays quiet by default but can still be escalated on demand.
8. As an on-call engineer, I want the phone call to be about the alert card in the group, so that picking up lands me in the full incident context.
9. As an on-call engineer, I want each receiver to be paged independently, so that one person's failed call does not stop a teammate from being reached.
10. As an SRE, I want a failed call to be retried with backoff up to a bounded attempt count, so that a transient Feishu or network failure does not silently drop the page.
11. As an SRE, I want a page retry to never re-post the alert card, and a card retry to never repeat the call, so that retries neither spam the group nor wake someone twice.
12. As an SRE, I want only firing alerts to auto-page, so that a recovery notification can never wake someone up.
13. As an SRE, I want repeated firing alerts for the same fingerprint, destination, and receiver not to re-page within a dedupe window, so that an alert storm does not become a call storm.
14. As an SRE, I want to manually page a responder for a delivery I am looking at, so that I can escalate a specific alert immediately.
15. As an SRE, I want a manual page to record who triggered it and when, so that manual escalations are auditable.
16. As an SRE, I want a delivery to show whether it can be paged at all and what happened to its pages (state, receiver, attempts, last error), so that I can audit and debug paging without leaving the console.
17. As an SRE, I want a webhook-mode delivery to explain why it cannot be paged, so that a disabled action is understandable rather than mysterious.
18. As an SRE, I want Feishu quota and permission rejections reported as non-retryable failures with a readable message, so that Tocsin does not retry forever and I know what to fix.
19. As an SRE, I want a destination that lacks receivers, a valid app, or `chat_id` to be rejected at save time, so that a broken paging configuration never silently sits there.
20. As an SRE, I want the destinations table to show which Feishu destinations can page, so that I can verify the paging setup at a glance.
21. As an SRE, I want deleting a referenced Feishu app to be refused with a clear message, so that I cannot silently break paging configurations.
22. As a self-hoster, I want apps and paging configuration to export and import with the rest of my configuration through TOML/JSON, so that my setup survives a rebuild or migration.
23. As a self-hoster, I want the app secret to come from an environment reference on import, so that a checked-in config file never contains the secret.
24. As a self-hoster, I want configuration documents without the new blocks to still import, so that adopting paging does not break existing exports.
25. As a self-hoster, I want paging to run inside the existing single process with the existing worker model, so that adopting it adds no new infrastructure to operate.
26. As an operator, I want the new surfaces localized in Chinese and English like the rest of the console, so that my team can use them in their own language.

## Implementation Decisions

- **飞书应用是独立资源**（新表 + 管理页 + 自己的 oRPC 过程），不是通知目标的内联字段。测试 = 用凭证换 `tenant_access_token` 验证有效。凭证按现有 secret 语义处理：不回显、不进 TOML 明文、日志与响应体走现有脱敏；被任何通知目标引用时拒绝删除并列出引用方。
- **飞书通知目标增加 `sendMode`（webhook / app，默认 webhook）。** app 模式引用 `{ 应用, chat_id }`，卡片由应用发出，响应中的 `message_id` 写入投递的 provider reference（这层通用管道已就位）。预览、测试、模板渲染、webhook 模式共用现有实现；`urgent` 配置只在 app 模式允许（保存时校验）。运维前提：应用机器人必须已加入目标群（`chat_id` 来源），表单与部署文档都要说清。
- **加急挂在某一次投递上，不引入策略实体。** 加急对象就是这条投递自己发出的消息。因此只有 app 模式投递可加急；webhook 投递在 UI 上显示为"无法加急"并给出原因（消息不是应用发出的，没有 `message_id`）。
- **触发 = 自动 + 手动：**
  - 自动：投递成功、带 provider reference、事件状态为 `firing`、severity 在目标的加急门槛内 → 为每个接收人创建一条 ping。
  - 手动：`operations.buzzDelivery({ deliveryId })`，从投递详情页触发，接收人取目标配置，记录操作者。失败落回队列重试。
  - 加急配置形状：`{ autoEnabled, severities（默认 ["critical"]）, userIdType, receivers（≥1，唯一） }`；`autoEnabled = false` 即只保留手动。显式空列表按默认 `["critical"]` 处理，不会放宽为不限级别。v1 不支持手动指定任意接收人。
- **ping 的粒度是一个接收人一条**：独立消息、独立呼叫、独立状态与独立重试；一个接收人失败不影响其他人。状态机为 `scheduled | running | fired | suppressed | failed`，其中 `scheduled` / `suppressed` 为后续延时/确认能力预留，本切片恒不出现。ping 记录投递、接收人、渠道、`message_id`、尝试次数、下次重试时间、最后错误、触发来源（`auto` / `manual` 与操作者）。
- **重试与退避**复用 delivery 语义：指数退避 + 有界最大尝试次数；可否重试按**飞书业务码**判定而不是按 HTTP 状态（平台把权限、配额、机器人不在群等永久性拒绝一律用 HTTP 400 返回，把限流用 `99991400`/HTTP 429 返回，把"未读加急过多"用 `230023` 返回）；配额/权限/配置类判定为不可重试并在错误信息里给出运维动作，限流与未读加急超限保留重试；接口在部分接收人无效时仍返回 `code 0` 并把无效 id 放进 `data.invalid_user_id_list`，落在该列表里的接收人不能算呼叫成功；ping 失败不回滚、不触碰对应投递的状态。
- **去重**按 `(fingerprint, 目标, 接收人)` 在一个去重窗口内只建一条 ping；去重键独立成表，不复用 delivery 的去重表。
- **加急渠道与投递目标适配器并列但独立**：加急渠道是封闭枚举（v1 唯一成员 `feishu_urgent_phone`），对"某条已存在的消息"执行呼叫；它不碰数据库、不读环境变量，`fetch` 与时钟由外部注入。官方文档已确认群卡片可由发送它的机器人直接加急，实现里没有单聊回退分支。
- **凭证解析在服务端路径完成**：投递发送、目标测试、加急执行三条路径按引用解析应用凭证后注入适配器；适配器不认识引用，也不接触存储。
- **oRPC 面**：新增 `integrations` namespace（应用的列表/创建/更新/删除/测试）+ `operations.buzzDelivery`；投递详情 DTO 增加 `pings[]`，与既有 provider reference 一起构成加急可见面。不新增 oncall namespace。私有过程一律 dashboard 鉴权，领域错误由边界统一翻译；DTO 不返回 `app_secret`。
- **删除语义**：删除被引用的应用被拒绝；ping 随投递级联删除，去重键随 ping 级联；source/route/destination 的既有级联策略不变。
- **操作摘要**：通知目标的操作配置新增 sendMode、应用名、群 `chat_id`、加急开关与接收人数，使目标表能直接看出"哪些目标会在 critical 时打电话"。接收人 id 是运维标识符而非 secret，可以进入已认证 dashboard。
- **文案**遵循 AGENTS.md 运维词汇（「加急」「值班」「呼叫对象」「应用凭证」），机器值（`feishu_urgent_phone`、`firing` 等）不翻译。

## Testing Decisions

- 好测试只断言外部行为：命令与 DTO 形状、服务状态转移、worker 的调用次数与顺序、HTTP 请求形状；不断言私有 helper、SQL 文本或内部实现细节。
- 主 seam 是**加急服务级集成测试**：内存 SQLite + 注入的假 urgency registry + 假时钟，覆盖"投递成功 → 自动入队（severity 门槛、firing-only、去重、每接收人一条）→ worker 执行 → 状态转移 → 退避重试"，并必须覆盖两条关键断言：**ping 失败不改投递状态**、**卡片重试不重复 ping**。先例是 `delivery-worker.service.test.ts` 与 `delivery-execution.test.ts`。
- 次 seam 是 **urgency 渠道单测**：假 `fetch` + 假时钟，断言 `message_id`、`user_id_type`、扁平 `user_id_list` 请求体与固定 `Content-Type`、token 获取与复用、凭证失效后重换 token、缺失 `expire` 时的 TTL 兜底、`invalid_user_id_list` 部分成功、按业务码的重试分类。先例是 `packages/destinations/src/feishu/index.test.ts`。
- 飞书目标测试：app 模式发送的请求形状与 provider reference 捕获、webhook 模式回归不变、`sendMode`/`urgent` 校验矩阵（urgent 只能 app 模式、receivers 非空唯一、appRef 必须存在）。
- 应用资源测试：CRUD、凭证测试、被引用时拒删、TOML/JSON 往返（含 secret 环境变量引用）与无新块的旧文档导入。
- oRPC 边界测试：新过程的 dashboard 鉴权覆盖与领域错误映射。先例是 `server-orpc-auth.test.ts`、`errors.test.ts`。
- UI 只测用户可见行为：目标表单的 mode 切换与加急区块、投递详情的手动加急入口可用性（含 webhook 投递的禁用态）。先例是 `features/destinations/model/destination-form.test.ts`。

## Out of Scope

- On-call 排班、轮转、shift calendar。
- 多级 escalation policy、超时未确认再升级、ack 确认与抑制（`scheduled` / `suppressed` 状态只预留枚举，不实现行为）。
- 恢复（`resolved`）呼叫。
- 短信（`urgent_sms`）与应用内（`urgent_app`）渠道；v1 只做电话。
- 自定义加急消息模板 / 按目标定制呼叫附带内容。
- 手动呼叫任意用户（不限于目标配置的接收人）。
- 把加急接收人配置到路由上（v1 只在通知目标上配置）。
- 独立的加急记录列表页（v1 在投递详情可见）。
- 按目标配置重试策略、per-channel 限流与并发。
- 飞书通讯录查询（接收人显示名解析）；接收人以原始 id 录入。
- 多实例 / 分布式呼叫协调。

## Further Notes

- 门槛核实（见 ADR 0009 步骤 0）已按官方接口文档 + Go/Node SDK 源码完成：凭证换 token 与缓存语义、应用向群发卡片拿 `message_id`、群卡片加急的请求形状与前置条件、错误码可否重试分类、部分成功语义，均已回写 ADR 并据此修正实现。仍需真实企业租户验证的是：端到端真实响铃、响铃时长与无人接听时的行为、发消息 `uuid` 去重键在重复请求时的响应语义（v1 因此不使用该字段）。
- 电话加急是飞书的有配额/计费能力（管理后台 > 费用中心 > 权益数据 > 短信/电话加急），且需要自建应用开通机器人能力与 `im:message.urgent:phone` 权限、接收人在应用可用范围内、群允许该机器人发起加急；README「飞书加急部署前提」与目标表单提示已写明这些前置条件。单次呼叫的接收人上限 200（Tocsin 一条 ping 一个接收人，正常运维不会触顶，但保存配置时按平台上限校验）。
- 一个 destination 引用一个应用；应用必须对接收人所在租户可用。
- 状态机保留 `scheduled` / `suppressed`，使后续"没人确认就升级 / 确认后抑制"能无迁移落地。
- 本版对 2026-10-08 的初版设计做了修订：初版是"独立加急策略实体 + 单聊载体"，修订为"应用资源 + 通知目标配置 + 投递级动作"。修订理由与被替换方案记录在 ADR 0009 的「不采用的替代方案」。
- 文件级实现顺序以 ADR 0009 的「实现顺序」章节为准；本 PRD 是产品契约，两者一起读。
