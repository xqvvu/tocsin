---
title: 可移植配置（TOML / JSON）
description: Tocsin 告警源、路由规则、通知目标与飞书应用的导入导出格式、secret_refs 和合并语义。
---

# 可移植配置（TOML / JSON）

「设置 → 可移植配置」用于把基础设置、飞书应用、告警源、通知目标和路由规则整理成一份可审阅、可迁移的文件。TOML 是首选格式；JSON 使用同一份文档结构和相同的 snake_case 字段名。

::: warning 配置导出不是数据库备份
可移植配置不包含 Event、Delivery、请求历史、告警静默、dashboard 用户、session、Source Token、Delivery 暂停状态或任何明文密钥。它适合复制配置和做 code review，不能用于完整恢复实例。数据库备份见[备份与恢复](/operations/backup-restore)。
:::

## 包含与不包含

| 内容 | 是否包含 | 说明 |
| --- | --- | --- |
| 语言、时区、原始载荷保留天数 | 是 | 对应实例级基础设置。 |
| 飞书应用 | 是 | 只导出 `app_id` 与 `secret_refs`，不导出应用密钥。 |
| 告警源 | 是 | 包含 Provider、启用状态与解析器配置，不包含接入 Token。 |
| 通知目标 | 是 | 包含目标类型、启用状态、模板配置与 `secret_refs`。 |
| 路由规则 | 是 | 包含匹配条件与目标 ID。 |
| Event、Delivery、attempt、加急记录 | 否 | 属于历史数据。 |
| 告警静默与维护窗口 | 否 | 当前不进入可移植配置。 |
| dashboard 用户、session、Source Token | 否 | 属于凭证或实例运行态。 |
| Delivery 暂停状态与暂停历史 | 否 | 属于实例运行态，不会随配置迁移。 |

## 操作流程

1. 打开「设置」，进入「TOML」或「JSON」页签。页面会读取当前配置并填入编辑器。
2. 选择「导出当前配置」下载 `tocsin.toml` 或 `tocsin.json`，也可以直接编辑编辑器内容。
3. 需要恢复文件时选择「从文件载入」。该动作只填充编辑器，不会立即导入；文件上限为 `1 MiB`，空白文件不会替换当前草稿。
4. 选择「应用导入」，先阅读确认弹层中的差异摘要。
5. 确认后，服务端重新校验整份文档、解析 `secret_refs`，并在一个 SQLite 事务中应用变更。

差异摘要会按告警源、通知目标、路由和飞书应用分别显示新增、更新、未变化与“文件中未列出”的条目，并提示基础设置是否变化。它是条目级摘要，不是逐字段 diff，也不会把缺失条目当作删除。

::: tip 先预览再导入
差异预览只在当前配置基线已加载时可用。即使预览通过，服务端仍会重新执行完整 schema、目标适配器、引用关系和密钥解析校验；浏览器侧校验不是安全边界。
:::

## 完整 TOML 示例

以下示例展示一条可工作的配置链路。示例域名、ID 和环境变量名都不是生产值。

```toml
[settings]
schema_version = "tocsin.config.v1"
exported_at = "2026-10-27T10:00:00.000Z"
include_secrets = false
locale = "zh-Hans"
time_zone = "Asia/Shanghai"
raw_payload_retention_days = 30

[[sources]]
id = "source-grafana-prod"
name = "Grafana production"
provider = "grafana"
enabled = true

[sources.secret_refs.signingSecret]
env = "GRAFANA_SHARED_SECRET"

[[destinations]]
id = "destination-relay"
name = "Internal event relay"
kind = "generic_webhook"
enabled = true

[destinations.config]
method = "POST"

[destinations.secret_refs.url]
env = "TOCSIN_DEST_DESTINATION_RELAY_URL"

[destinations.secret_refs."headers.Authorization"]
env = "TOCSIN_DEST_DESTINATION_RELAY_HEADERS_AUTHORIZATION"

[[routes]]
id = "route-critical-checkout"
name = "Critical checkout alerts"
enabled = true
destination_ids = ["destination-relay"]

[routes.rule]
source_ids = ["source-grafana-prod"]
severities = ["critical"]
statuses = ["firing"]
title_contains = ["Checkout"]
message_contains = ["5xx"]

[[routes.rule.labels]]
key = "environment"
operator = "equals"
value = "prod"
```

导入这份文件前，必须在 Tocsin 进程环境中设置三个引用变量：

```bash
export GRAFANA_SHARED_SECRET='<grafana shared secret>'
export TOCSIN_DEST_DESTINATION_RELAY_URL='https://relay.example.test/tocsin'
export TOCSIN_DEST_DESTINATION_RELAY_HEADERS_AUTHORIZATION='Bearer <relay token>'
```

如果导入发生在另一个容器或实例，环境变量也必须注入那个实例。可移植配置的 `secret_refs` 只读取 Tocsin 进程的 `process.env`；不支持 `_FILE` 间接读取，`BETTER_AUTH_SECRET_FILE` 也不适用于这些引用。运行时变量与 secret 注入边界见[环境变量与运行时配置](/operations/configuration)。

## 顶层结构

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `settings` | 是 | 基础设置表，不能省略。 |
| `feishu_apps` | 否 | 飞书应用数组；省略时按空数组处理，但不会删除现有应用。 |
| `sources` | 否 | 告警源数组；省略时不会删除现有告警源。 |
| `destinations` | 否 | 通知目标数组；省略时不会删除现有通知目标。 |
| `routes` | 否 | 路由规则数组；省略时不会删除现有路由。 |

文档使用严格 schema。未知顶层字段、未知条目字段、未知 Provider 或目标类型都会使整次导入失败，错误通常会包含字段路径和首条校验信息。

## 基础设置

```toml
[settings]
schema_version = "tocsin.config.v1"
exported_at = "2026-10-27T10:00:00.000Z"
include_secrets = false
locale = "zh-Hans"
time_zone = "Asia/Shanghai"
raw_payload_retention_days = 30
```

| 字段 | 约束与用途 |
| --- | --- |
| `schema_version` | 必填，当前只接受 `tocsin.config.v1`。 |
| `exported_at` | 可选的 ISO 时间元数据；导入不会把它写入设置。UI 导出会生成该字段，需要稳定文件时可删除。 |
| `include_secrets` | 必填且只能是 `false`。Tocsin 不提供明文密钥导出。 |
| `locale` | `en-US` 或 `zh-Hans`；缺省时回落为 `en-US`。 |
| `time_zone` | 有效 IANA 时区；缺省时回落为 `UTC`。影响事件时间与通知模板的展示格式。 |
| `raw_payload_retention_days` | 必填整数，范围 `0`–`3650`；`0` 会把清理边界设为事件接收时刻，后续接入会清除更早事件的原始载荷。 |

导入基础设置会覆盖实例当前的语言、时区和保留天数。Settings 页的 Delivery 暂停开关不在这三个字段中，也不随导入变化。

## 告警源

```toml
[[sources]]
id = "source-grafana-prod"
name = "Grafana production"
provider = "grafana"
enabled = true

[sources.secret_refs.signingSecret]
env = "GRAFANA_SHARED_SECRET"
```

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定标识。导入按 ID 做 upsert；改 ID 会创建新告警源并保留旧条目。 |
| `name` | 运维可读名称。 |
| `provider` | `generic`、`signoz`、`grafana`、`uptime_kuma`、`alertmanager` 或 `fastgpt`。 |
| `enabled` | 是否接受新的 Webhook 请求。 |
| `config` | 额外的 Provider JSON 配置。内置 Provider 当前主要识别 `signingSecret` 作为附加共享密钥；不要假设任意键会改变解析行为。 |
| `secret_refs` | 敏感配置路径到环境变量名的映射，导入时在服务端解析。 |

告警源接入 Token 与 token hash 永远不会进入导出文件。把配置导入一个**新** ID 时，Tocsin 会生成新的接入 Token，并在导入成功提示中一次性显示；必须立即保存并更新上游系统。更新已有 ID 不会替换该告警源的 Token。

Provider 的载荷字段、严重程度归一化和接入认证见[告警源接入参考](/integrations/providers)。

## 通知目标

```toml
[[destinations]]
id = "destination-relay"
name = "Internal event relay"
kind = "generic_webhook"
enabled = true

[destinations.config]
method = "POST"

[destinations.secret_refs.url]
env = "TOCSIN_DEST_DESTINATION_RELAY_URL"
```

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定标识；路由通过 `destination_ids` 引用它。 |
| `name` | 运维可读名称。 |
| `kind` | `generic_webhook`、`feishu`、`slack` 或 `email`。 |
| `enabled` | 是否允许已启用路由向该目标创建有效投递。 |
| `config` | 目标适配器配置，键名使用适配器 JSON 字段，而不是 TOML snake_case。 |
| `secret_refs` | 端点、签名密钥和 Header 等敏感路径到环境变量名的映射。 |

目标配置的模板、收件人和网络语义见[通知目标参考](/integrations/destinations)。可移植配置只负责把这些值安全地搬运，不会改变 Preview、Test 或真实 Delivery 的行为。

### 通知目标密钥路径

| 目标类型 | 固定敏感路径 | 额外规则 |
| --- | --- | --- |
| `generic_webhook` | `url` | `config.headers` 中每个值都按凭证处理。 |
| `feishu` | `webhookUrl`、`signSecret` | 应用模式还需单独导出飞书应用记录。 |
| `slack` | `webhookUrl` | 实际请求体与模板结构由 Slack 适配器产生。 |
| `email` | `endpointUrl` | `config.headers` 中每个值都按凭证处理。 |

导出会删除 `config.headers` 的整个映射，并为每个 Header 名生成 `secret_refs["headers.<Name>"]`。Header 名只能包含字母、数字、`_` 和 `-`；包含 `.`、`$` 等字符时导出会失败，而不是退化为明文。非敏感 Header 值也遵循这一规则。

## 飞书应用

飞书应用是可供通知目标应用发送模式和电话加急复用的独立资源。它不在 Destination 的 `config` 中保存应用密钥。

```toml
[[feishu_apps]]
id = "feishu-app-sre"
name = "SRE pager app"
app_id = "cli_example"

[feishu_apps.secret_refs.appSecret]
env = "TOCSIN_FEISHU_APP_FEISHU_APP_SRE_APPSECRET"
```

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定应用标识。 |
| `name` | 运维可读名称。 |
| `app_id` | 飞书自建应用 ID。 |
| `app_secret` | 可选的内联导入值；导出永不生成。生产文件应使用 `secret_refs.appSecret`。 |
| `secret_refs` | 当前支持 `appSecret` 路径。 |

应用发送模式的通知目标通过 `config.app.appRef` 引用这个 `id`。导入时会先处理飞书应用，再校验通知目标引用；引用不存在会让整次事务失败。

## 路由规则

```toml
[[routes]]
id = "route-critical-checkout"
name = "Critical checkout alerts"
enabled = true
destination_ids = ["destination-relay"]

[routes.rule]
source_ids = ["source-grafana-prod"]
severities = ["critical"]
statuses = ["firing"]
title_contains = ["Checkout"]
message_contains = ["5xx"]

[[routes.rule.labels]]
key = "environment"
operator = "equals"
value = "prod"
```

路由条件之间是 AND 关系；同一字段的数组内部通常表示“任一匹配”：

| 字段 | 匹配语义 |
| --- | --- |
| `source_ids` | 空数组表示不限制来源；非空时事件必须来自其中一个 ID，且该 ID 必须能解析到告警源。 |
| `severities` | `critical`、`warning`、`info`、`unknown` 中的任意一个。 |
| `statuses` | `firing`、`resolved`、`unknown` 中的任意一个。 |
| `labels` | 每个 matcher 都必须命中；`operator` 为 `equals` 或 `contains`。 |
| `title_contains` | 每个字符串都必须出现，大小写不敏感。 |
| `message_contains` | 每个字符串都必须出现，大小写不敏感。 |
| `destination_ids` | 必填、至少一个且不能重复；每个 ID 必须能在导入后解析到通知目标。 |

所有条件为空的路由会匹配所有来源和所有事件，应只在明确需要“全量转发”时使用。目标数组必须引用文件中已出现的通知目标，或引用当前数据库中已经存在的目标。

## `secret_refs` 语法

`secret_refs` 的值形如：

```toml
[destinations.secret_refs.url]
env = "TOCSIN_DEST_DESTINATION_RELAY_URL"
```

要求如下：

- `env` 必须是合法环境变量名：以字母或 `_` 开头，后续只允许字母、数字和 `_`。
- 路径使用点分隔的配置键，例如 `webhookUrl`、`signSecret`、`headers.Authorization`。
- 路径段不能为空，不支持数组下标、通配符或表达式，也不能使用 `__proto__`、`prototype`、`constructor`。
- 导入时缺失环境变量或 `[REDACTED]` 占位值会使整次导入失败；变量存在但内容无效时，通知目标适配器校验仍会阻止事务提交。

UI 导出会生成便于操作的默认变量名，但手工编辑时可以使用自己的环境变量名。默认命名规则会把 ID 和路径中的非字母数字字符替换为 `_` 并转为大写：

| 资源 | 默认格式 | 示例 |
| --- | --- | --- |
| 告警源 | `TOCSIN_SOURCE_<ID>_<PATH>` | `TOCSIN_SOURCE_SOURCE_GRAFANA_PROD_SIGNINGSECRET` |
| 通知目标 | `TOCSIN_DEST_<ID>_<PATH>` | `TOCSIN_DEST_DESTINATION_RELAY_URL` |
| 飞书应用 | `TOCSIN_FEISHU_APP_<ID>_APPSECRET` | `TOCSIN_FEISHU_APP_FEISHU_APP_SRE_APPSECRET` |

不要把这些变量的真实值写入仓库、工单、路由配置或浏览器存储。它们属于与数据库备份同级的敏感材料。

## JSON 格式

JSON 下载使用与 TOML 相同的文档模型和字段名，只是改用标准 JSON 对象语法：

```json
{
  "settings": {
    "schema_version": "tocsin.config.v1",
    "include_secrets": false,
    "locale": "zh-Hans",
    "time_zone": "Asia/Shanghai",
    "raw_payload_retention_days": 30
  },
  "sources": [],
  "destinations": [],
  "routes": []
}
```

TOML 与 JSON 文件不能在同一页签之间自动转换。TOML 页只能导入 TOML，JSON 页只能导入 JSON；选择文件只载入文本，不会根据扩展名切换格式。

## 导入合并语义

导入不是“替换整个数据库”，也不是逐字段深合并：

- 按 `id` 为每种资源做 upsert。文件中存在的条目会创建或覆盖该条目的字段；文件中未出现的现有条目保持原样。
- 对已列出的告警源、通知目标或路由，导入以文件中的完整条目为准。手工编辑时不要只保留想改的一个字段而删掉同一实体的其他必要配置。
- `settings` 总是更新语言、时区和原始载荷保留天数，即使 `sources`、`destinations` 或 `routes` 为空。
- 所有变更在一个 SQLite 事务中执行；schema、目标配置、引用关系或环境变量任一失败时，整次导入回滚。
- 导入不会删除任何未列出的资源，也不会撤销告警静默或恢复暂停的 Delivery。
- 新增告警源会生成一次性接入 Token；已有告警源的 Token 保持不变。

## 常见错误

| 错误 | 处理 |
| --- | --- |
| `schema_version` 无效 | 使用当前 `tocsin.config.v1`，不要沿用旧版或手写其他版本。 |
| `Unrecognized key` | 删除拼错或不属于当前 schema 的字段；文档是严格校验的。 |
| `Invalid option` | 核对 `provider`、`kind`、severity 和 status 的机器值。 |
| `Missing environment variable` | 在 Tocsin 进程环境中注入 `secret_refs` 指向的变量，然后重启或重新创建容器。 |
| 配置文件超过 1 MiB | 拆分迁移，或仅保留需要变更的实体；UI 文件载入上限不是数据库大小限制。 |
| 路由引用不存在 | 先导入目标与告警源，或在当前实例中保留对应 ID。 |
| 通知目标适配器校验失败 | 用目标参考页核对 `config` 字段；错误来自适配器 schema，而不是 TOML 语法。 |
| `[REDACTED]` 被拒绝 | 替换为真实值或 `secret_refs`；脱敏占位符不能作为凭证导入。 |

::: warning 迁移前先备份
配置迁移无法恢复历史 Event、Delivery、告警静默或 dashboard 用户。跨实例迁移时先备份源实例与目标实例，并在非生产环境演练导入，再更新上游 Webhook Token。
:::

相关页面：[备份与恢复](/operations/backup-restore) · [版本升级与回滚](/operations/upgrade-rollback) · [Docker 生产部署](/operations/deploy-docker) · [告警源接入参考](/integrations/providers) · [通知目标参考](/integrations/destinations) · [故障排查](/operations/troubleshooting)
