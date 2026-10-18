# 决策记录：扩大 secret 脱敏覆盖（SEC-1）

- 日期：2026-10-18
- 状态：已实施
- 触发：自主迭代 backlog `SEC-1`（原 `escalated`，本轮交由 EXPERT_PANEL 自主裁决）
- 决策方式：3 位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），结论一致

## 1. 问题

`packages/core/src/redaction.ts` 的 `isSensitiveKey` 使用整键正则，漏掉常见
secret 字段名（`appSecret`、`clientSecret`、`apiSecret`、`privateKey`、
`X-Auth-Token` 等）。该判定同时驱动：

- `redactHeaders` / `redactJsonValue`：原始 payload、header、日志与导出脱敏；
- `config-portability.ts`：source 配置导出与 destination header 的
  `secret_refs` 派生（`destinationSecretPaths` 对 header 名调用 `isSensitiveKey`）；
- `redactText`：worker/投递错误消息的文本脱敏。

同时，`redactText` 原先维护第二份字面量键名清单，且不支持带引号的 JSON
键值（例如 `"clientSecret":"..."`），与 `isSensitiveKey` 双轨漂移。

## 2. 三位专家意见

### 安全与可靠性专家

- 推荐「归一化 + 精确集合 + 词尾规则」，而不是继续堆叠大小写/分隔符变体。
- 必须覆盖 `appSecret` / `clientSecret` / `apiSecret` / `privateKey` /
  `X-Auth-Token`，同时不误伤 `privateKeyId`、`tokenCount`。
- `redactText` 不应维护第二份清单；应复用同一判定并支持带引号的值。
- 最大风险：误加裸 `key` / `auth` / 任意子串匹配会把 `publicKey`、`authMode`
  等运维字段从原始 payload 和导出中抹掉。

### 产品与运维专家

- 必须隐藏的是 secret 值本身；endpoint、host、method、header 名、appId、
  chatId、收件人、模板模式和「secret 是否已配置」应保持可见。
- 扩大 denylist 只损失秘密值，不影响排障定位；明确不要加宽泛 key。
- 额外发现（转为后续候选）：导入流程不识别字面量 `[REDACTED]`，手工编辑过的
  导出文件可能把占位符当真值写回并覆盖已有凭据。本轮不改导入语义，记入 backlog。
- Product charter 不违反。

### 独立评估者

- 纯函数 + 端到端导出测试，可测。
- 必须同时覆盖 `isSensitiveKey` 与 `redactText`，并加反例锁定「整键/词尾匹配」
  语义（`tokenCount`、`maxTokens`、`privateKeyId`、`monkey`）。
- **不要**断言所有 manifest `secretFields` 都被 `isSensitiveKey` 覆盖：
  `url` / `endpointUrl` 由 `config-portability.ts` 的穷尽 switch 负责，该断言必假。
- 端到端用例应把 `X-Auth-Token` 加入 destination header fixture，验证导出后
  出现 `secret_refs.headers.X-Auth-Token` 且明文消失。
- 无 schema/迁移，可逆。

## 3. 最终选择

采用安全与可靠性专家的方案，并吸收评估者的测试边界：

1. `isSensitiveKey` 先归一化（小写 + 去除非字母数字），再匹配：
   - 精确集合：`authorization`、`cookie`、`token`、`secret`、`password`、
     `apikey`、`accesskey`、`secretkey`、`privatekey`、`signingkey`、
     `signingsecret`、`signsecret`、`webhookurl`、`credential(s)` 等；
   - 词尾规则：`secret` / `token` / `password` / `passwd` / `passphrase` /
     `credential` / `privatekey` / `apikey` / `authorization` / `cookie`。
   - `token`（单数）而非 `tokens`，避免误伤 `maxTokens`；复数名词由精确集合处理。
2. `redactText` 的键名正则**由同一集合与词尾规则程序化生成**，不再维护第二份
   字面量清单；支持 `key=value`、`key: value`、`"key":"value"` 与带引号的值。
3. 扩展 `packages/core/src/redaction.test.ts`：正例、反例、嵌套 JSON、JSON 文本。
4. 在 `configuration.integration.test.ts` 的 generic webhook fixture 中加入
   `X-Auth-Token` header，验证导出链路。

## 4. 验收

- `vp -C packages/core test run`：通过（76 tests）。
- `vp -C apps/console test run src/server/configuration/configuration.integration.test.ts`：
  通过（51 tests）。
- 导出文档中不再出现 `X-Auth-Token` 明文，且生成
  `secret_refs["headers.X-Auth-Token"]`。
- `tokenCount` / `maxTokens` / `privateKeyId` 保持可见。

## 5. 回滚

回退 `packages/core/src/redaction.ts`、`redaction.test.ts` 与
`configuration.integration.test.ts` 的 fixture 改动即可。无数据结构变更；
若期间已导出配置，重新导出即可（导出不写 `[REDACTED]`，而是删除 secret 并生成
`secret_refs`）。

## 6. 后续候选

- `FIX-6`：导入时拒绝字面量 `[REDACTED]`，避免覆盖真实凭据。
- 长期：导出从 `manifest.secretFields` 派生，替代手写 switch（当前已有
  `_exhaustive` 守卫，风险可控）。
