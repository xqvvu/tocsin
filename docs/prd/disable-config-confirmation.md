# 停用配置前的断流影响确认

状态：已实现（第 29 轮，对应 backlog NEW-A）

## 问题

告警源、路由和通知目标的启停按钮都是单击即执行，没有任何确认或影响面提示：

- 告警源：停用后 Webhook 接入会被直接拒绝（`apps/console/src/server/intake/intake.service.ts:69-72`），
  但操作员在列表页看不到哪些已启用路由依赖它。
- 路由：停用后新事件不再匹配（`intake.service.ts:98-99`），且该路由下已排队但未发送的投递
  不再被 claim（`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:228-229`）。
- 通知目标：停用后引用它的路由不再投递，排队中的投递会暂停（`delivery.repository.ts:227`），
  直到重新启用。

值班期间误点一次停用，可能造成静默断流；恢复前已经排队的投递不会自动补发。
启用方向是安全操作，不需要确认。

## 用户故事

作为一名值班 SRE，我希望在停用告警源、路由或通知目标之前，看到停用会影响多少条已启用路由、
以及排队中的投递会怎样处理，避免误操作造成告警静默丢失。

## 范围

- 三个配置列表的行内启停按钮：告警源、路由、通知目标。
- 仅在「启用 → 停用」方向弹出确认对话框；「停用 → 启用」保持单击立即执行。
- 确认文案展示当前行的影响面：
  - 告警源：匹配该源的已启用路由数量（含 catch-all 路由）。
  - 通知目标：引用该目标的已启用路由数量。
  - 路由：关联的通知目标数量。
- 中文与英文文案同步；中文使用 SRE 术语（告警源、接入、路由匹配、通知目标）。

## 非目标

- 不改变启停的后端语义、接口或数据库。
- 不新增「批量停用」入口。
- 不展示排队投递的实时条数（需要新的只读聚合接口，留待后续需求）。
- 不阻止停用，只提示影响。

## 验收标准

- 点击启用中的告警源/路由/通知目标停用按钮，先出现确认对话框，取消不会调用启停回调。
- 确认后调用原有启停回调，行为与之前一致。
- 告警源确认文案按已启用路由数区分「有路由」与「当前没有已启用路由」两种表述。
- 通知目标确认文案同样区分是否有已启用路由引用。
- 路由确认文案包含关联通知目标数量。
- 停用中的行点击启用按钮不出现对话框，直接调用回调。
- `apps/console` 相关组件测试覆盖上述分支；`vp check` 与 `vp run -r test` 通过。

## 架构边界

- 纯前端切片：仅改 `features/{sources,routes,destinations}/ui` 与两份 i18n 消息文件。
- 影响面计数复用既有前端派生函数：`sourceRouteCoverage`
  （`apps/console/src/features/sources/model/source-route-coverage.ts:10-27`）与
  `destinationRouteCoverage`
  （`apps/console/src/features/destinations/model/destination-route-coverage.ts:12-26`）；
  路由目标数直接取 `RouteDefinition.destinationIds.length`。
- 不新增 oRPC 过程、不新增 DTO 字段、不引入迁移或依赖。
- 复用现有 `AlertDialog` 组件与 `IconTooltip`、`powerActionButtonClassName` 约定。
