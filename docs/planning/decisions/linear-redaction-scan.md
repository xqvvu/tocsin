# 决策记录：把文本脱敏改为线性扫描（SEC-19）

- 日期：2026-10-20
- 状态：已实施
- 触发：自主迭代 backlog `SEC-19`（第 32 轮升级 HIGH；第 33 轮专家小组因配额饥饿未能召开，本轮重开）
- 决策方式：3 位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），结论一致

## 1. 问题

`packages/core/src/redaction.ts` 的文本脱敏有两处正则回溯随输入长度呈二次增长：

1. `SENSITIVE_TEXT_KEY_SOURCE` 的后缀分支 `[A-Za-z0-9._-]*` 被拼进
   `TEXT_ASSIGNMENT_PATTERN`，在每个词边界重试整个前缀。第 33 轮实测 80 KB 约
   2.5 秒；本轮三位专家分别复现到 40 KB 约 0.4–1.1 秒、80 KB 约 2.7–4.3 秒。
2. URL userinfo 分支 `\b([a-z][a-z0-9+.-]*:\/\/)...` 在长点号/连字符串上同样二次
   回溯。安全专家实测 1 MiB 输入 **233 秒**，且它位于 `redactJsonValue` 的同步接
   入路径（`apps/console/src/server/intake/intake.service.ts:79-81`），请求线程内
   就会阻塞事件循环。

默认 webhook 上限为 1 MiB（`apps/console/src/env.ts:33-37`，最大可配 10 MiB），
因此持有有效 Source token 的上游系统可以发送一个合法载荷把单进程 worker 卡死数
分钟。读取、投递、日志边界同样调用这些函数，恶意事件在运维打开详情页时也会触发。

## 2. 三位专家意见

### 安全与可靠性专家

- 两处都必须线性化；只修 assignment 不能关闭 SEC-19（1 MiB 仍会被 userinfo 阻塞
  约 233 秒）。
- 推荐手写线性扫描器，覆盖不变；旧正则只保留在测试里作为差分 oracle。
- 否决 `{1,64}` 有界量词：会漏掉「>64 字符无分隔符前缀 + secret 后缀」的真实凭
  据，属于缩小脱敏覆盖，触碰红线；且它并不解决 userinfo 与空格串。
- 否决分块 + 重叠窗口：固定 overlap 无法覆盖任意长前缀或跨块值，且每块仍可能二
  次；要保住语义必须携带跨块状态，等价于流式扫描器。
- 原型（/tmp，未提交）与旧实现差分 6 万条 assignment 用例 + 12 万条 URL 用例，
  0 差异；1 MiB 从分钟级降到毫秒级。

### 产品与运维专家

- 唯一可接受的方案是「覆盖不变、可差分证明、可回滚」的线性扫描器。
- 排障语义必须完全保留：endpoint/header 名/收件人可见，只有 secret 值被替换；
  `[REDACTED]` 是 UI 行为契约（事件标签据此禁用按值静默，投递证据据此回退到接
  入快照）。
- 按载荷大小区别对待（跳过大文本、截断、分块）不可接受：大载荷正是异常/攻击场
  景，会出现「同一 secret 在小日志里脱敏、在大日志里明文」。
- 纯 `packages/core` 函数替换，无 schema、无迁移、无配置、无新依赖，符合
  Product charter；回滚只需 revert 并换回上一个镜像。

### 独立评估者

- 方案可测，但现有 112 条测试不足以证明无回归；必须新增：
  - 冻结旧正则作为测试内 oracle 的差分 fuzz（固定种子）；
  - 语义钉死用例（精确键单分隔符、`\b`、引号键、引号值回退、未加引号值边界、
    Unicode 空白、URL userinfo）；
  - 性能闸门（40 KiB 三形状 <100 ms，1 MiB 五形状 <2 s，实测线性实现低一个数量级）。
- 钉死了最容易写错的语义：`web__hookurl`/`token__hash` 必须保持可见；`"foo.webhook_url"`
  不脱敏而 `foo.webhook_url=secret` 脱敏；`".token"` 不脱敏而 `"_token"` 脱敏；
  `token="abc" ` 走未加引号回退并丢弃尾随空白；`\s+KEY` 可跨行，能先于换行截断值。
- 明确不要新增「全局幂等」门槛：旧实现本身在约 0.045% 的对抗输入上第二遍输出不
  同，把它变成验收条件会扩大范围。
- 回滚验证：用同一组 1 MiB 载荷与正常凭据载荷在新旧镜像上对比显示结果。

## 3. 最终选择

采用 A+：

1. `redactSensitiveAssignments` 改为单向前进扫描器。键匹配精确复刻旧语义：
   - 精确键允许字符之间至多一个 `[._-]`（不含尾随分隔符）；
   - 后缀键前缀长度无上限；
   - 未加引号键可在 `.`/`-` 之后的后继词边界开始匹配，`_` 不构成边界；
   - 引号键要求闭合同型引号，且内容起点必须是词字符；
   - 值的 quoted/unquoted 分支、转义、`\s+KEY` 跨行截断、`quotedFallback` 全部
     按旧顺序复刻；
   - 每个空白 run 只做一次前瞻，扫描严格线性。
2. `CREDENTIAL_VALUE_PATTERNS` 改为有序 redactor 列表；URL userinfo 用线性扫描
   器替换，只替换 password span，保持 slack → feishu → xox → userinfo →
   authscheme 的顺序。
3. 旧实现冻结在 `packages/core/src/redaction.scan.test.ts` 中作为差分 oracle；新
   增语义钉死、差分 fuzz 与 `redaction.perf.test.ts` 性能闸门。
4. 不改 `redactText` / `redactCredentialText` / `redactJson*` 的公共签名与调用顺
   序；不加依赖、不改 schema/迁移/配置。

## 4. 理由

- 覆盖不变：差分 fuzz + 冻结 oracle 证明匹配集合与旧实现一致；所有新增语义用例
  都来自旧实现的真实行为（含评估者指出的易错边界）。
- 线性：40 KiB 与 1 MiB 的五种对抗形状均在毫秒级完成，性能闸门比实测慢一个数
  量级，不会被 CI 抖动误伤，但二次回归会在 40 KiB 闸门立即失败。
- 可逆：改动仅限 `packages/core` 的一个模块与测试；无数据迁移。回滚 = revert 该
  提交并部署上一个镜像，读取边界会重新投影旧行。

## 5. 验收

- 现有 62 条 `redaction.test.ts` 不改断言全部通过。
- 新增 9 条语义/差分测试（含 10,000 条确定性 fuzz）通过。
- 新增 6 条性能测试通过：40 KiB ≤100 ms、1 MiB ≤2 s，且输出不含明文 secret。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 6. 回滚

1. `git revert` 本提交（rebase 合并下产生一个 revert 提交），或部署上一个发布镜像。
2. 无需数据库 down migration；读取层会重新脱敏旧行。
3. 用同一组载荷复验：1 MiB 点号串、1 MiB 空格串、长前缀 `token=...`、
   `https://user:pass@host`、正常 `Authorization`/`token=` 载荷。
4. 若上线窗口内出现欠脱敏：已发出的投递不可撤回，按泄露处理并轮换相关凭据；检
   查 SQLite/WAL/备份中的 `delivery_attempts.last_error`、`response_body`、
   `oncall_calls.last_error` 与解析失败事件文本。
