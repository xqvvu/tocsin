# Q-42：飞书加急空 severity 列表的语义

状态：已决策并实现（2026-10-20，第 36 轮）。

## 背景

飞书应用模式目标的加急电话门槛 `urgent.severities` 在四层语义不一致：

- schema 允许显式空数组：`packages/destinations/src/feishu/schema.ts:125`，
  `.default(["critical"])` 只对字段缺失生效。
- 触发层把空数组当作「不限级别」：`oncall.service.ts:155-160`。
- DTO 投影把空数组映射为 `["critical"]`：`destination.helpers.ts:194-205`。
- 编辑草稿对存量空数组显示「一个都没选」：`destination.helpers.ts:138`。
- 说明面板据此给出与实际触发相反的原因：`urgent-ping-explanation.ts:74-79`。
- 表单本身已把空选择规范为 critical：`destination-form.ts:598-607`。

配置导入（TOML/JSON）可以绕过表单写入 `severities: []`，因此这不是纯理论问题。

## 候选方案

- **A 规范化**：空列表等价于 `["critical"]`。
- **B 拒绝**：schema 加 `.min(1)`，空列表非法。
- **C 不限级别**：空列表表示不限，保留 `[]` 并修正投影与说明面板。

## 专家小组意见

三位专家独立返回，结论一致推荐 A。

### 安全与可靠性专家

- A 的失效方向安全：最坏情况是手写 `[]` 本意为「全部」时非 critical 级别漏呼，
  且说明面板会如实显示 `severity_excluded`；不会产生电话风暴，critical 永不漏呼。
- B 的爆炸半径最大：`FeishuConfigSchema` 同时是 adapter 发送前校验
  （`packages/destinations/src/feishu/adapter.ts:44-60`）。存量 `[]` 会让卡片投递、
  预览、编辑、导入与加急全部失败或静默停摆，且触发层解析失败无日志。
- C 会把「没选」变成「全选」，`info`/`unknown` 也可能半夜呼叫；还制造
  「字段缺失 = critical / 显式空 = 不限」的隐藏状态。
- 规范化应收敛到 schema 单一出口，避免四个边界各写一遍；触发层保留纯成员判断。
- 不需要迁移：存量行在读取/触发时归一，下一次保存或导入自然落库为
  `["critical"]`，旧代码能正确读取。

### 产品与运维专家

- 加急 severity 是「叫醒许可名单」，不是普通筛选器。路由/抑制的「空 = 不过滤」是
  匹配语义，不能套用到计费、扰民的电话动作上。
- 产品契约已多处写定 critical 是默认：PRD、ADR、表单归一、i18n 文案
  「未选择时按 critical 处理」。Q-42 是让运行时向既有产品意图看齐。
- C 与表单注释「防止意外放宽到所有告警」正面冲突；B 会让旧导出不可导入，
  且编辑/保存任意字段都可能失败。
- 需要决策记录；不需要新 PRD。发布说明应提示：存量 `[]` 配置的自动加急
  将从「所有级别」收窄为「仅 critical」，需要全级别请显式全选。

### 独立评估者

- A 的可测试性最好：只有 schema 一处新增语义，DTO/form 已经正确，存量行天然兼容。
- 现状有多个「删掉实现仍绿」的盲点：schema 只测缺失、表单空 severity 用例因
  receivers 为空提前返回、投影未测显式 `[]`、说明面板只喂手工 metadata。
- 必须补：schema 显式 `[]`、触发层存量 `[]` + warning/info、DTO 显式 `[]`、
  编辑草稿、表单可达分支、写路径落库与更新归一的红绿测试。
- B 若实施必须先有数据迁移，且仍无法兼容旧导出，不建议。

## 最终选择

**A：空 severity 列表在所有边界等价于 `["critical"]`。**

实现位置：

1. `packages/destinations/src/feishu/schema.ts`：`.default(["critical"])` 后增加
   transform，空数组归一为 critical。这是唯一语义出口，触发、发送、导入、预览
   共用。
2. `apps/console/src/server/oncall/oncall.service.ts`：删除 `length > 0` 逃生口，
   只保留成员判断；schema 已保证非空。
3. `apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts`：
   编辑草稿与投递元数据共用 `normalizedUrgentSeverities`，存量 `[]` 显示并解释为
   critical。
4. `urgent-ping-explanation.ts`：逻辑不变，补注释说明 `[]` 仅代表无 urgent 块。

不新增数据库迁移，不改变投递/路由/auth 语义。

## 理由

- 与表单、DTO、i18n 文案、PRD/ADR 的既有默认一致，最小惊讶。
- 失效方向 fail-closed：空/脏数据只会收窄到 critical，不会放大到全级别。
- 单一事实源，避免 Q-42 的四层分叉再次出现。
- 单提交可回滚，无 schema/数据变更。

## 验收标准

- schema：显式 `[]` → `["critical"]`；缺失 → `["critical"]`；显式列表原样保留；
  非法级别仍被拒绝。
- 触发：存量 `[]` + warning/info → 0 条 ping；`[]` + critical → 每个接收人一条。
- 写路径：创建与更新会把 `[]` 落库为 `["critical"]`。
- 投影：存量 `[]` → `urgentSeverities: ["critical"]`；无 urgent 块 → `[]`。
- 编辑草稿：存量 `[]` 显示 critical。
- 表单：receivers 非空 + 空选择 → critical。
- 说明面板：存量 `[]` + warning 无 ping → `severity_excluded`，列表为 critical。
- `vp check` 0 errors，`vp run -r test` 全绿。

## 回滚

1. `git revert` 本决策对应的单个提交，重新构建部署。
2. 无数据库操作；存量 `[]` 行保持原样，回滚后恢复旧的「不限级别」触发行为。
3. A 生效期间保存/导入产生的 `["critical"]` 不会被回滚改回 `[]`，这是预期的一次性
   效果；若确需全级别，显式全选四个级别。
4. 发布前可用只读 SQL 盘点存量空数组行：

```sql
SELECT id, name
FROM destinations
WHERE json_type(config_json, '$.urgent.severities') = 'array'
  AND json_array_length(config_json, '$.urgent.severities') = 0;
```
