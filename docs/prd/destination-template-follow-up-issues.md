# Destination 模板后续模式 Issues

Parent issue: https://github.com/xqvvu/tocsin/issues/15

本文档把 `Follow-up destination template modes` 拆成后续可领取的垂直切片。当前不直接实现
Slack blocks、Email HTML 或 generic webhook JSON 模板；这些模式需要先基于 Feishu 模板引擎的
落地结果确认边界，再逐个进入 AFK 实现。

## 1. Review Follow-Up Destination Template Requirements

GitHub issue: https://github.com/xqvvu/tocsin/issues/16

Type: HITL

Blocked by: Issues 10, 13, 14

User stories covered: 23, 24

### What to build

Review Slack blocks, Email HTML, and generic webhook JSON payload requirements against the implemented Feishu
template model. Confirm which requirements can reuse TemplateContext v1, recursive string interpolation,
diagnostics, preview result, and adapter-local `template` config without changing the security boundary.

### Acceptance criteria

- [ ] Slack blocks, Email HTML, and generic JSON requirements are compared against the Feishu implementation.
- [ ] Any required change to TemplateContext, diagnostics, preview result shape, or adapter manifest metadata is documented before implementation.
- [ ] Security boundaries remain explicit: no user JavaScript, no raw payload template variables, no destination secrets, and no source tokens.
- [ ] The three implementation slices below are confirmed, merged, or re-split before code changes.

## 2. Slack Blocks Template Mode

GitHub issue: https://github.com/xqvvu/tocsin/issues/18

Type: AFK

Blocked by: https://github.com/xqvvu/tocsin/issues/16

User stories covered: 23, 24

### What to build

Add a Slack `slack_blocks` template mode that renders Slack-native Block Kit JSON using the shared template
renderer. The Slack destination should continue supporting text mode, while block mode previews and sends a
secret-safe payload through the existing destination test and delivery paths.

### Acceptance criteria

- [ ] Slack config accepts `template.mode = "text"` and `template.mode = "slack_blocks"`.
- [ ] Slack block templates recursively interpolate string fields only.
- [ ] Preview/rendered payloads omit webhook URL and any destination secret.
- [ ] Destination test and delivery use the same Slack block renderer.
- [ ] Template validation errors are non-retryable configuration errors.
- [ ] Tests cover text compatibility, block rendering, diagnostics, preview safety, and send payload shape.

## 3. Email Subject Text And HTML Template Modes

GitHub issue: https://github.com/xqvvu/tocsin/issues/17

Type: AFK

Blocked by: https://github.com/xqvvu/tocsin/issues/16

User stories covered: 23, 24

### What to build

Extend Email templates to support explicit subject, text body, and HTML body template fields while preserving the
existing secret-safe email gateway boundary. HTML rendering must document and enforce the escaping/sanitization
boundary before the mode is exposed in the console.

### Acceptance criteria

- [ ] Email config supports structured template fields for subject, text body, and optional HTML body.
- [ ] Text and subject rendering reuse safe path interpolation.
- [ ] HTML rendering has an explicit escaping or sanitization boundary and tests for unsafe input.
- [ ] Preview/rendered payloads omit endpoint URL, recipients if classified secret-sensitive, and transport headers.
- [ ] Destination test and delivery use the same renderer.
- [ ] Tests cover subject/text/HTML rendering, diagnostics, and secret-safe preview behavior.

## 4. Generic Webhook JSON Payload Template Mode

GitHub issue: https://github.com/xqvvu/tocsin/issues/19

Type: AFK

Blocked by: https://github.com/xqvvu/tocsin/issues/16

User stories covered: 23, 24

### What to build

Add a generic webhook JSON payload template mode that lets operators define the outbound JSON payload shape while
reusing the shared JSON template renderer. The mode must remain destination-local config and must not allow direct
raw payload variables.

### Acceptance criteria

- [ ] Generic webhook config supports `template.mode = "text"` and a JSON payload template mode.
- [ ] JSON payload templates recursively interpolate string fields only.
- [ ] Raw payload, raw headers, source token, destination config, destination secret, route, and delivery variables are rejected.
- [ ] Preview/rendered payloads omit webhook URL and sensitive headers.
- [ ] Destination test and delivery use the same JSON renderer.
- [ ] Tests cover custom JSON rendering, diagnostics, text compatibility, TOML round-trip, and secret-safe preview behavior.
