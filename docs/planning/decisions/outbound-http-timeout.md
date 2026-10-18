# 决策记录：出站 HTTP 超时（Q-1）

- 日期：2026-10-18
- 状态：已实施
- 触发：自主迭代 backlog `Q-1`（原 `escalated`，本轮交由 EXPERT_PANEL 自主裁决）
- 决策方式：3 位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），结论一致

## 1. 问题

所有 destination adapter 通过 `Adapter.getTransportContext` 取 fetch
（`packages/destinations/src/utils.ts`），但没有任何请求超时。一个挂起的目标会：

- 让单进程 worker 的一条投递一直处于 `running`，直到 5 分钟 stale 回收
  （`delivery-worker.service.ts:40`）；
- 阻塞同一批已 claim 的其他投递（worker 串行发送）；
- 白耗一次 attempt，且期间 runner 跳过新 tick。

`DestinationErrorKind` 已声明 `"timeout"`（`packages/destinations/src/types.ts`），
但没有任何路径产生它；`Send.transportFailureResult` 把所有传输异常一律归为
`network_error`。

## 2. 三位专家意见

### 安全与可靠性专家

- 在共享层实现，而不是每个 adapter 各传 `signal`：调用点有 9 处，新增 adapter
  容易漏；ADR 0002 也主张由 console/container 提供策略包装。
- 用 `AbortSignal` 通知真实 fetch，同时 **race 一个 deadline**，这样不监听
  signal 的测试替身或运行时也无法挂死。
- 超时应映射为 `errorKind: "timeout"` + `retryHint: "retryable"`；现有
  at-least-once 语义不变。
- 默认 10s；环境变量可调，上限 60s。Feishu app 一次发送含 token + message
  两次请求，各计 10s。

### 产品与运维专家

- 超时应表现为「可重试失败」，沿用现有退避与最大次数；瞬态网络/DNS/TLS 问题
  有恢复机会，告警噪声有界。
- 默认 10s 合理；建议环境变量范围 1–30s，先不做按 adapter 覆盖。
- 超时显著缓解队头阻塞，但同一批串行发送仍会被一条慢投递拖慢；并发不在本轮。
- 错误文案应稳定可辨识（例如 `Destination request timed out after 10000ms`）；
  不建议把中文写进持久化错误。

### 独立评估者

- 必须可注入超时时长；不能只测生产默认值。
- 必须在共享层实现，不能只在 container 注入，否则现有传入 fake fetch 的测试
  会绕过超时。
- `Send.readResponseBody` 会吞掉所有错误；超时发生在响应体阶段时会被误判为
  成功，必须重抛 timeout。
- 至少覆盖：包装器拒绝、错误分类、worker 重试排程、普通错误仍为
  `network_error`；不要在验收里要求 DB/UI 显示 `timeout`（当前不持久化
  `errorKind`）。

## 3. 最终选择

采用「共享层包装 + 可注入时长」方案：

1. 新增 `packages/destinations/src/transport.ts`
   - `DEFAULT_DESTINATION_TIMEOUT_MS = 10_000`；
   - `createTimeoutFetch(fetch, timeoutMs)`：传入 `signal`、race deadline，
     deadline 覆盖响应体 `text()`；`timeoutMs <= 0` 关闭超时（供「模拟挂起进程」
     的既有测试使用）；
   - `DestinationTimeoutError`（`name = "TimeoutError"`）与 `isTimeoutError`，
     同时识别运行时 `DOMException("TimeoutError")` 与 `cause`。
2. `DestinationTransportContext` 增加可选 `timeoutMs`；`Adapter.getTransportContext`
   默认 10s，并始终包装生效的 fetch。
3. `Send.transportFailureResult` 映射为 `timeout` / `retryable`；
   `Send.readResponseBody` 重抛超时、保留其它读错误的旧行为。
4. `shared/feishu-app-client.ts` 与 `urgency/feishu-urgent/client.ts` 的 catch
   同步识别超时。
5. Console：`TOCSIN_DESTINATION_TIMEOUT_MS`（整数，1–30000ms，默认 10000）注入
   delivery worker、on-call worker、destination test 与 Feishu app 测试。

取舍说明：环境变量上限取产品/运维专家的 30s，而不是安全专家的 60s——30s
已能覆盖慢邮件网关，同时让 10 条串行投递的最坏耗时保持在 5 分钟 stale 窗口内。

## 4. 验收

- `packages/destinations/src/transport.test.ts`：挂起 fetch 在 10ms 后以
  `TimeoutError` 拒绝；响应体挂起同样拒绝；`timeoutMs: 0` 返回原 fetch。
- `packages/destinations/src/utils.test.ts`：`timeout`/`retryable` 映射，
  普通错误仍为 `network_error`；响应体超时不被吞掉。
- `generic-webhook/index.test.ts`：adapter 级超时用例。
- `delivery-worker.service.test.ts`：超时后 `retrying: 1`、状态 `pending`、
  `nextAttemptAt` 按退避排程、`lastError` 为稳定文案。
- `vp check`：0 errors；`vp run -r test` 全绿；`vp run -r build` 通过。

## 5. 回滚

回退 `packages/destinations/src/transport.ts`、`utils.ts`、两个 Feishu client、
`env.ts`、`container.ts`、`feishu-app.service(.types).ts` 及测试即可。
无 schema/迁移；已按超时失败排期的重试照常执行。运维可临时调大
`TOCSIN_DESTINATION_TIMEOUT_MS`；彻底关闭超时需回滚代码（`timeoutMs: 0` 只用于
测试模拟挂起进程，环境变量不接受 0）。

## 6. 后续候选

- 持久化 `errorKind` 并在 Deliveries UI 映射「投递超时，将自动重试」。
- 若真实数据表明慢邮件网关普遍超过 10s，再考虑按 adapter 覆盖默认值。
- 同批投递并发化（本轮不做）。
