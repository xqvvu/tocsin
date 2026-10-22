# 决策：一次性接入 Token 是否可在客户端组件中展示

- 日期：2026-10-22（第 80 轮）
- 关联：backlog `UI-36`、`Q-38`；PRD `docs/prd/source-token-once-display.md`
- 决策方式：EXPERT_PANEL 三位专家独立评估，一致同意

## 背景

创建/轮换告警源时，服务端只返回一次明文 Token，数据库只存哈希
（`apps/console/src/server/sources/source.service.ts:40-49,68-73`）。控制台已把 Token 放进
页面级 React state（`apps/console/src/features/sources/ui/sources-page.tsx:29,92-94`），但成功
面板从不渲染它，只提供复制按钮。非安全上下文（`http://<LAN-IP>`）下
`navigator.clipboard` 不存在，`copyText` 静默返回 `false`，调用方忽略返回值，失败分支还
用 `toast.success` 提示「复制失败」——操作员会永久丢失唯一一次可见的 Token。

约束来自 `AGENTS.md` §Security And Data Exposure：不得通过 client components、query data、
route loader data、URL、日志等暴露 Source Token。

## 专家意见

### 安全与可靠性专家

- 展示 Token 不新增信任边界：Token 已随 create/rotate 响应进入浏览器内存并作为 prop
  传入客户端组件，本次只改变渲染。
- 规则禁止的是「可再次检索的持久化暴露」；一次性创建响应无法避免进入浏览器内存，否则
  产品不可用。建议在 AGENTS.md 明确这一例外，避免后续代理把功能「修回去」。
- 要求：用只读文本而不是密码输入框；不自动复制；关闭即卸载；不进入 URL/存储/日志/错误上报。
- 复制降级（textarea + `execCommand`）安全，失败必须抛错而不是静默返回。

### 产品与运维专家

- 展示一次性 Token 是 GitHub PAT 式的成熟运维模式；自托管常见 HTTP 访问下，这是唯一
  可行的交付方式。
- 拒绝「短时重开」端点（会把一次性 secret 变成持久化暴露）、二维码、仅下载文件。
- 最小验收：HTTP 下可见可选中；失败提示可操作；移动端可长按选择；显式关闭且不自动消失。

### 独立评估者

- 代码核实：四个 `copyText` 调用方都只 `await` + `catch`，不读取返回值，改为抛错安全。
- 指出 jsdom 没有 `document.execCommand`，测试必须显式 stub，否则「降级成功」用例会
  误走失败路径。
- 要求同步修正 E2E 中「面板不渲染任何值」的过时断言，并补「Token 可见」断言。
- 要求新 i18n 键保持 parity、扁平、无句末标点。

## 最终选择

一致同意实施方案 A+B+C+D：

- A：成功面板以只读、等宽、可全选的文本展示 Token，提供「我已保存」显式关闭动作。
- B：`copyText` 优先 Clipboard API，失败或不可用时降级 textarea + `execCommand`，两者都
  失败则抛 `Error`。
- C：面板失败分支改为 `toast.error`，附「请手动选中内容后复制」。
- D：补充 `copyText` 三路径测试、面板可见性/成功/失败/关闭测试，并同步 E2E 断言。
- 同时在 AGENTS.md 记录一次性展示例外。

## 理由

- 不展示会让自托管 HTTP 用户必然丢失 Token 并反复轮换，是实际的数据丢失缺陷。
- 不新增传输、持久化或读取路径；Token 仍只存在于创建/轮换响应和临时组件 state。
- 方案可完全回滚，无迁移、无 API/DTO 变化。

## 回滚

回滚单个 PR 的合并提交即可；已签发的 Token 不受影响。若只回滚展示部分而保留复制降级，
必须同时保留面板的错误提示，否则会退回「假成功」。不需要数据库或配置清理。

## 后续

- REQ-143（离开页面保护）仍单独评估，不在本决策范围内。
- 不新增任何「再次查看 Token」能力。
