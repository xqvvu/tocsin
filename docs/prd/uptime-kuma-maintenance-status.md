# Uptime Kuma：维护中与待定心跳不再升级为 critical 告警

Q-280（第 128 轮质量车道发现）

## 问题

Uptime Kuma 的心跳 `status` 是数值枚举：`0 = DOWN`、`1 = UP`、`2 = PENDING`（重试中）、
`3 = MAINTENANCE`（维护窗口）。Tocsin 的解析器只把 `1` 当作已恢复，其余任何数字都判为
`firing`，并在 `firing` 时固定使用 `critical` 严重度
（`packages/providers/src/uptime-kuma/parse.ts:68-69,124-130`）。

后果：维护窗口（`status: 3`）或重试待定（`status: 2`）的心跳会被写成
`severity: critical, status: firing`，命中 `severity=critical` 的路由；若目标配置了加急呼叫，
值班人员会在**计划内维护**期间真的被打电话。

同一语义用字符串表达时却走了另一套映射：`"pending"` / `"maintenance"` 不在
`normalizeStatus` 的白名单里（`packages/providers/src/shared/normalization.ts:22-32`），
结果是 `unknown` / `info`。同一上游状态因编码形式不同得到相反结论。

## 用户故事

作为值班工程师，我在计划维护窗口内不希望收到 critical 告警或被自动呼叫；维护结束后监控恢复
正常，也不应该留下一条误报的 critical 事件。作为排障者，我希望未知状态被如实标为 `unknown`，
而不是伪装成确定的故障。

## 范围

- `normalizeUptimeKumaStatus` 显式映射数值：`0 → firing`、`1 → resolved`、`2 / 3 / 其它数字
  → unknown`。
- 字符串分支继续复用 `normalizeStatus`，`"pending"` / `"maintenance"` 同样落到 `unknown`，
  保证两种编码形式一致。
- 非 `firing` 状态不授予 `critical` 严重度（沿用现有 `status === "firing" ? critical : info`）。
- 补回归测试：数值 `2`、`3`、字符串 `"pending"`、`"maintenance"` 均为 `unknown` / `info`；
  非法数值（如 `99`）同样为 `unknown`；`0` / `1` 的既有断言保持不变。

## 非目标

- 不改 Uptime Kuma 通知配置、不改 webhook 契约、不改事件入库与路由匹配逻辑。
- 不改 `normalizeStatus` 的通用白名单（其它 provider 依赖它）。
- 不为 `unknown` 增加新的 UI 徽标或 i18n 文案。
- 不做「维护窗口内抑制投递」这类新功能，本次只修正解析语义。

## 验收标准

1. `status: 2` 与 `status: 3` 的心跳解析为 `status: "unknown"`、`severity: "info"`。
2. `status: "pending"` 与 `status: "maintenance"` 得到同样结果。
3. `status: 0` 仍为 `firing` / `critical`，`status: 1` 仍为 `resolved` / `info`。
4. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 只改 `packages/providers/src/uptime-kuma/parse.ts` 与其测试，不新增依赖、不改 schema、
  不改投递/路由/auth 语义，不动共享 normalization 的既有映射。
- 决策记录见 `docs/planning/decisions/uptime-kuma-maintenance-status.md`（EXPERT_PANEL）。
