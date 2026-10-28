# 决策记录：脱敏 `dbPass` / `userPass` / `dbPwd` 一类密码缩写键（SEC-39）

- 日期：2026-10-28
- 状态：已实施
- 触发：自主迭代 backlog `SEC-39`（第 150 轮 security-exposure 车道发现，连续两轮待裁决）
- 决策方式：3 位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），结论一致

## 1. 问题

`packages/core/src/redaction.ts` 的精确键集合只有逐字 `pass` / `pwd`，后缀正则也不含
这两个名词，因此 `dbPass`、`userPass`、`dbPwd` 被判为**可见**：

- 入站写入即调用 `redactJsonValue`（`apps/console/src/server/intake/intake.service.ts:81`），
  一旦上游载荷带这些键，明文会**永久**写入 SQLite 的 raw payload；
- 事件详情、投递预览走 `redactJsonText`（`redaction.ts:422`）同样漏判；
- 日志属性、占位符与错误消息（`apps/console/src/server/runtime/log-safety.ts:54,84,19`）
  不脱敏；
- 可移植配置导出（`apps/console/src/server/configuration/config-portability.ts:459,483`）
  会把它们写进导出的 TOML/JSON。

原注释（`redaction.ts:43-45`）与测试（`redaction.test.ts` 的「keeps … visible」列表）
把 `dbPass` 与 `bypass` 一起定为故意可见，理由是避免误伤 `bypass`。这正是缺口。

## 2. 三位专家意见

### 安全与可靠性专家

- 不要改后缀正则：它跑在 `normalizeKey` 之后（去大小写与分隔符），`dbpass` 与
  `bypass` 在归一化串里无法区分。
- 推荐「原始键分段」规则：按分隔符与 camelCase 转折切分，最后一段属于
  `{pass, pwd}` 才判敏感，与既有精确集合/后缀规则取并集。
- `dbPass`、`userPass`、`dbPwd`、`DB_PASS`、`db.pass` 命中；`bypass`、`compass`
  单段不命中；`bypassToken` 本就由 `token` 后缀覆盖。
- 最大风险是误伤可见键：日志字段变 `[REDACTED]` 后没有替代信息源；配置导出会把
  命中键移出并生成 secretRef，需要环境变量侧配置。
- 可逆性：单函数可一行回滚；但写入侧脱敏不可逆，库中已写的明文不会因回滚而恢复，
  回滚只影响后续行。

### 产品与运维专家

- 应当修：AGENTS.md「Security And Data Exposure」明确密码不得进入导出与日志，
  `dbPass` 正是密码。
- 采用词边界规则，不放开裸后缀；必须保持 `bypass`（抑制/路由排障语义）、
  `signatureAlgorithm`、`privateKeyId`、`dsnName`、`tokenCount` / `maxTokens` 可见。
- 值班影响：命中时事件详情/投递预览显示 `[REDACTED]` 属预期；按用户、host 检索不受
  影响；配置导出再导入需要设置对应环境变量（现有 secretRef 流程）。
- 符合 Product charter：单进程、自托管、无需新组件。

### 独立评估者

- 规则可测，但必须同时改两处：既有 pin（`redaction.test.ts` 的可见列表）与
  **文本级**路径；只改 `isSensitiveKey` 会让 `dbPass=...` 在自由文本/日志里继续明文。
- 边界确认：`PASS` 已被精确集合覆盖；`dbpass` / `DBPASS` 这类无边界粘连形式无法
  从词形判断，保持可见并在文档与测试中写明。
- 验收用例：正例 `dbPass` / `userPass` / `dbPwd` / `DB_PASS` / `db.pass` / `x-pass`；
  反例 `bypass` / `compass` / `bypassReason` / `dbpass` / `dsnName` / `privateKeyId`；
  另加结构化 JSON、自由文本赋值、日志属性各一条。
- 可逆：纯函数、无迁移；`git revert` 即可。

## 3. 最终选择

采用「原始键分段 + 复用同一判定」：

- 新增 `endsWithPasswordNoun(value, start)`：按 `.` `_` `-` 与 camelCase 转折切分
  原始键，最后一段小写后等于 `pass` 或 `pwd` 即判敏感。单段键（`bypass`、
  `compass`）与裸 `pass` / `pwd`（已在精确集合）不受影响。
- `isSensitiveKey` 与文本级 `endsWithSensitiveKeySuffix` 都复用它，避免两份规则
  漂移（`redaction.ts:85-86` 与 `:431-442` 的双轨问题是 SEC-1 的教训）。
- 无边界粘连形式（`dbpass`、`DBPASS`）保持可见，这是刻意的保守取舍：词形无法
  区分英文复合词，误伤 `bypass` 的代价高于漏判一个不常见的全小写键名。

## 4. 理由

- 三位专家一致；规则窄、可解释、可测试，且同时覆盖结构化键与自由文本。
- 不引入新的运行时依赖、不改接口、不改 schema。
- 误伤集合明确且可枚举（只有末段为 `pass`/`pwd` 的复合键）。

## 5. 回滚

`git revert <commit>`，随后运行 `vp -r test` 与 `vp check`。回滚只恢复后续写入的
可见性；已写入 SQLite 的 `[REDACTED]` 值无法还原（写入侧脱敏本来就不保留原值）。
