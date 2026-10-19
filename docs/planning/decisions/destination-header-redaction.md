# 决策记录：Destination 自定义 header 脱敏（SEC-5）

- 日期：2026-10-19
- 状态：已实施
- 触发：自主迭代 backlog `SEC-5`（HIGH，安全 lane 于第 14 轮发现）
- 决策方式：3 位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），结论一致

## 1. 问题

可移植配置导出（TOML/JSON）与 Destination 编辑 DTO 只对 `isSensitiveKey` 命中的
header 名脱敏：

- `apps/console/src/server/configuration/config-portability.ts` 的
  `destinationSecretPaths` 只把 denylist 命中的 header 加入 secret 路径；
  `X-Custom-Auth: Bearer ...` 这类自定义认证头会以明文进入导出文件。
- `apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts`
  的 `configHeaderLinesForEditor` 同样只清空 denylist 命中的值，自定义认证头
  的值会进入浏览器 DTO。

但适配器 manifest 早已把整个 headers map 声明为值敏感
（`packages/destinations/src/generic-webhook/manifest.ts`、
`packages/destinations/src/email/manifest.ts` 的 `valueSensitive: true` 与
`secretFields.path = "headers"`），i18n 文案也承诺「值只保留在服务端」
（`apps/console/src/i18n/messages/zh-Hans.json`）。header 名是任意字符串，
denylist 无法穷举。

## 2. 三位专家意见

### 安全与可靠性专家

- 推荐全量遮蔽（方案 A），与 manifest 的 `valueSensitive` 和 fail-closed 原则一致。
- 硬约束：不能按点路径逐条删除 header 值。header 名可含 `.`、`$` 等字符，而
  secret path 只允许 `[A-Za-z0-9_-]` 分段；`X.Api` 会被拆成嵌套路径而漏删，
  `X-Api$Key` 会让导出抛错。必须整表删除 `headers`，无法表达的名称明确报错。
- 需要检测 `slugEnvPart` 造成的 env 名冲突（`X-Auth` 与 `X_Auth`），并裁剪
  已不存在 header 的陈旧 `secretRefs`，避免导入时复活。
- 备选：允许列表需要第二套分类且可能被绕过；manifest 驱动（D）方向正确但
  改动面大，可在 A 落地后演进。

### 产品与运维专家

- 推荐 A：运维仍能看到 header 名、endpoint、method、secret 配置状态与投递结果，
  只是看不到值；替换与新增仍可用。
- 指出仅 A 不够：深合并 + `formHeaderLines` 丢弃空值意味着留空/删行都无法删除
  已有 header。建议补显式删除语义或至少文档声明。
- 导出→导入需要为每个 header 注入环境变量，缺 env 时整笔事务回滚并报出变量名，
  与现有 URL secret 模型一致。
- 符合 Product charter：无新服务/依赖，不改投递/路由/auth 核心语义。

### 独立评估者

- A 可用现有 Vitest + 内存 SQLite + integration test 直接验收；B 无法证明任意
  自定义头不泄漏；C 仍向浏览器回显值；D 需要把 registry 注入仓储层，回归面最大。
- 必须覆盖：`.`/`$`/空格 header 名 fail-closed、env 名冲突、陈旧 refs、导出→
  导入往返、编辑 DTO 不含值、留空保存不覆盖已存值、旧明文导出仍可导入。
- 确认现有 `configuration.integration.test.ts` 中 `X-Team = "sre"` 的断言必须更新，
  Feishu 导出/导入、list DTO `headerNames`、创建表单映射等测试必须保持不变。

## 3. 最终选择

三人一致，采用 **方案 A**，并吸收两位专家的硬约束：

1. 导出时整表删除 `config.headers`，为每个 header 生成
   `secret_refs["headers.<Name>"] = { env: TOCSIN_DEST_<id>_HEADERS_<name> }`。
2. header 名必须匹配 `^[A-Za-z0-9_-]+$` 且通过 `isSafeSecretPath`；否则抛
   `DomainValidationError`，错误信息包含 destination 与 header 名。
3. 归一化后 env 名冲突时 fail-closed，提示重命名其中一个 header。
4. 导出前裁剪当前 config 中不存在 header 的 `headers.*` 陈旧 refs。
5. 编辑 DTO 只输出 `Name:`（排序），不输出任何值；留空=保留、填值=替换。
6. `secretFieldPaths` 同步把全部 header 名视为 secret 字段。
7. 导入侧额外拒绝 header 值等于 `[REDACTED]` 占位符（含 secret path 无法表达的
   header 名）。
8. i18n 文案说明「编辑时只显示名称，值留空表示保留原值」。

## 4. 验收

- `vp -C apps/console test run src/server/configuration/configuration.integration.test.ts`：
  56 tests 通过。
- 新增用例覆盖：非 denylist 自定义头不出现在导出/编辑 DTO；`.` header 名 fail-closed；
  env 名冲突 fail-closed；陈旧 refs 被裁剪。
- 既有 Feishu 导出/导入、明文 header 导入、`headerNames` DTO、创建表单映射测试不变。
- `vp check` 0 errors；`vp run -r test` 全绿；`vp run -r build` 通过。

## 5. 回滚

`git revert` 即可。无 schema/迁移、无数据改写；已存 header 值不变；旧导出文件
仍可导入。回滚后新格式导出文件仍可被旧代码导入（`secret_refs` 机制兼容），
只是旧代码会再次在导出中暴露自定义 header 值。

## 6. 残余风险与后续

- **header 删除仍不可用**：编辑表单无法移除已有 header（留空与删行都是保留）。
  这是既有语义，不是本次引入；但全量遮蔽后更不易察觉。已记入 backlog
  `REQ-71`，建议下一轮增加显式删除语义（契约 + 表单 + 测试）。
- **导出条件变严**：含 `.`/`$`/空格等 RFC tchar 的 header 名无法导出，需重命名。
  这是 fail-closed 的刻意取舍，错误信息已给出可执行指引。
- **导入 env 成本**：每个 header 都需要一个环境变量，与 URL/webhook secret 的
  既有模型一致。
