# Uptime Kuma 维护/待定心跳的状态映射

- 状态：已决（2026-10-27，第 128 轮）
- 关联：backlog `Q-280`；PRD `docs/prd/uptime-kuma-maintenance-status.md`
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），
  三人一致推荐方案 A

## 问题

Uptime Kuma 心跳 `status` 是数值枚举：`0 = DOWN`、`1 = UP`、`2 = PENDING`（重试中）、
`3 = MAINTENANCE`（维护窗口）。`packages/providers/src/uptime-kuma/parse.ts:124-130`
只把 `1` 判为 `resolved`，其余任何数字判为 `firing`；`parse.ts:68-69` 又对 `firing`
固定授予 `critical` 严重度。于是维护窗口与重试待定会写成
`severity: critical, status: firing`，命中 `severity=critical` 的路由；若目标配置了
加急呼叫，值班会在计划维护期间真的被打电话
（`apps/console/src/server/oncall/oncall.service.ts:157-169`）。

同一语义用字符串表达时走另一套映射：`"pending"` / `"maintenance"` 不在
`packages/providers/src/shared/normalization.ts:22-32` 的白名单里，落到
`unknown` / `info`。同一上游状态因编码形式不同得到相反结论。

## 三位专家意见

### 安全与可靠性专家

- 现状是最坏路径：维护与重试是常态，误报会产生加急呼叫、告警疲劳与「狼来了」，
  最终导致真实故障被忽视；收益面为零。
- 方案 A（`0 → firing`、`1 → resolved`、`2/3/其它 → unknown`）只影响非 `0/1` 数值，
  真实 DOWN 仍 critical firing、真实 UP 仍 resolved，主故障路径不变。
- 反对 B（`2 → warning` 仍 firing）：status 匹配型路由下误报完全保留，只是把呼叫
  降级为通知，还制造「数值 warning、字符串 unknown」的新不一致。
- 可逆性高：纯函数回滚；已入库事件不回溯，重放同一 payload 因幂等键只由 payload
  hash 决定（`parse.ts:80`）也不会改写旧事件。

### 产品与运维专家

- 误报呼叫的代价是复合的，远比「名义上的漏报」不可接受；PENDING 转 DOWN 时上游会
  补发 `0`，维护本身不是故障。
- unknown 事件仍会入库、仍会投递到未按 severity/status 过滤的路由，可观察性没有
  丢失，只是不再谎报严重度。
- 符合产品定位：解析器应忠实归一化，而不是推断；PM 文档把维护窗口抑制列为未来范围
  （`docs/prd/self-hosted-alert-hub-mvp.md:148`），本次不新增抑制功能、不新增状态枚举。
- 推荐 A；B 是降级版误报，C 不可接受。

### 独立评估者

- 方案 A 完全可测：新增数值 `2/3/99`、字符串 `"pending"/"maintenance"`、
  `heartbeatJSON` 别名、`monitorStatus` 回退、缺省 status、默认标题、幂等键差异等断言。
- 回归锁定：既有 5 条测试零改动全绿（status `0` 的整对象断言、status `1`、
  fingerprint 优先级、labels 脱敏、非对象 payload 抛错）。
- 下游调用面已核实：入库、路由匹配、抑制、加急、投递模板均按 status/severity 工作，
  本次是**有意的运行期语义变更**，须在 PR 描述与发布说明中明示。
- 已知展示副作用（不在本 PR 修）：`packages/destinations/src/feishu/fastgpt-card.ts:41`
  以 `status === "firing"` 二选一显示「探测失败/已恢复」，unknown 会落到「已恢复」
  文案。记入 backlog 作为后续切片。
- 推荐 A；`parserVersion` 保持 `1`（归一化字段集合未变）。

## 最终选择

**方案 A**：数值 `0 → firing`、`1 → resolved`、`2 / 3 / 其它数值 → unknown`
（严重度沿用 `status === "firing" ? critical : info`，即 `info`）。字符串分支继续复用
`normalizeStatus`，两种编码形式从此一致。

## 理由

- 三票一致；A 是唯一同时消除「维护期 critical 误报」和「数值/字符串语义分裂」的方案。
- 改动收敛在一个纯函数与其测试，无 schema、无迁移、无契约变更。
- 语义更诚实：上游没有声明故障时，Tocsin 不再替它声明。

## 回滚方式

1. `git revert <commit>`（或只还原 `parse.ts` 的映射函数），重新部署单进程实例。
2. 重跑 `packages/providers` 测试，确认既有 0/1 断言恢复。
3. 无数据库迁移、无缓存清理；已入库事件与已发出的通知/呼叫不回溯、不撤回。
