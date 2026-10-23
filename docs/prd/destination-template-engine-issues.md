# Destination 结构化模板引擎 Issues

Parent PRD: `docs/prd/destination-template-engine.md`

GitHub parent issue: https://github.com/xqvvu/tocsin/issues/9

## 1. Shared Destination Template Model And Renderer

GitHub issue: https://github.com/xqvvu/tocsin/issues/10

Type: AFK

Blocked by: None - can start immediately

User stories covered: 4, 5, 6, 14, 15, 16, 20, 23, 25, 26

### What to build

Create the shared destination template model, safe TemplateContext, recursive string interpolation, variable allow-list validation, diagnostics, and non-retryable configuration error helpers. The renderer should support text templates and JSON templates without introducing expressions, conditionals, loops, functions, or raw payload variables.

### Acceptance criteria

- [x] TemplateContext v1 exposes only safe Event, Source, Destination, and Tocsin link fields.
- [x] Renderer interpolates allowed variables in text and nested JSON string fields.
- [x] Unknown variables return diagnostics with template paths.
- [x] Missing allowed labels render as empty strings.
- [x] Raw/header/config/secret/route/delivery variables are rejected.
- [x] Renderer tests cover success, missing labels, nested diagnostics, and unsafe paths.

## 2. Feishu Text And Card Template Modes

GitHub issue: https://github.com/xqvvu/tocsin/issues/11

Type: AFK

Blocked by: Issue 1

User stories covered: 2, 3, 17, 18, 19, 20, 24

### What to build

Replace Feishu `messageTemplate` rendering with `template` rendering. Support `text` and `feishu_card` modes, default templates, basic Feishu card shape validation, secret-safe preview/rendered payloads, signed wire payloads, and clear failure classification.

### Acceptance criteria

- [x] Feishu text mode renders `{ msg_type: "text", content: { text } }`.
- [x] Feishu card mode renders `{ msg_type: "interactive", card }`.
- [x] Preview/rendered payloads omit webhook URL, sign secret, timestamp, and sign.
- [x] Wire payload still adds timestamp/sign when sign secret is configured.
- [x] Local template errors produce `configuration_error` and `not_retryable`.
- [x] Feishu sender tests cover text, card, signing, target rejection, and secret safety.

## 3. Replace MessageTemplate In Config, TOML, And Form Models

GitHub issue: https://github.com/xqvvu/tocsin/issues/12

Type: AFK

Blocked by: Issue 2

User stories covered: 1, 21, 22, 27

### What to build

Remove the old `messageTemplate` config model from destination schemas, TOML portability, and destination form data mapping. Persist and export explicit `template` config. Do not add migration compatibility for old `messageTemplate` data.

### Acceptance criteria

- [x] Destination schemas use `template` and no longer accept `messageTemplate`.
- [x] New Destination form values write explicit `template`.
- [x] TOML import/export accepts and emits `template` only.
- [x] Configuration integration tests reject invalid templates and cover TOML round-trip.
- [x] Existing tests and fixtures are updated away from `messageTemplate`.

## 4. Template Preview Result With Samples And Redacted Raw Reference

GitHub issue: https://github.com/xqvvu/tocsin/issues/13

Type: AFK

Blocked by: Issue 1

User stories covered: 7, 8, 10, 11, 12, 13, 14, 16

### What to build

Extend destination preview to return a structured template preview result with sample metadata, safe TemplateContext, rendered payload, diagnostics, and optional redacted raw payload reference. Support built-in sample Event and dashboard-authenticated historical Event sample selection.

### Acceptance criteria

- [x] Preview returns destination summary, sample metadata, context, rendered payload, diagnostics, and optional raw payload reference.
- [x] Built-in sample preview works without persisted Events.
- [x] Historical Event sample preview uses normalized Event data and redacted raw payload only.
- [x] Preview never returns source tokens, destination secrets, raw sensitive headers, webhook URLs, timestamp, or sign.
- [x] Tests cover built-in and historical sample preview.

## 5. Feishu Template Editing UI

GitHub issue: https://github.com/xqvvu/tocsin/issues/14

Type: AFK

Blocked by: Issues 2, 3, 4

User stories covered: 2, 7, 8, 9, 10, 11, 12, 13, 16

### What to build

Add Feishu template editing UI with mode selector, JSON/template editor, variable reference panel, sample Event selector, normalized fields, redacted raw payload reference, rendered payload preview, and diagnostics display.

### Acceptance criteria

- [x] Feishu Destination form offers text and card template modes.
- [x] Card mode provides JSON/template editing and default card restoration.
- [x] Variable reference panel lists TemplateContext v1 fields with examples and insert actions.
- [x] Preview displays rendered payload, diagnostics, normalized fields, and redacted raw payload reference.
- [x] Invalid templates cannot be saved.
- [x] UI tests cover mode switching, variable insertion, preview diagnostics, and secret-safe display.

## 6. Follow-Up Destination Template Modes

GitHub issue: https://github.com/xqvvu/tocsin/issues/15

Follow-up split: `docs/prd/destination-template-follow-up-issues.md`

Type: HITL

Blocked by: Issues 1, 4

User stories covered: 23, 24

### What to build

Decide and implement follow-up modes for Slack blocks, Email HTML, and generic webhook JSON payload templates after Feishu validates the shared model. This issue should be split further before implementation.

### Acceptance criteria

- [x] Slack blocks, Email HTML, and generic JSON requirements are reviewed against the Feishu implementation（见 `destination-template-follow-up-review.md`，2026-10-10 评审完成）。
- [x] Follow-up PRD or issue split is created before code changes.
- [x] No additional destination modes are implemented without explicit scope approval.
