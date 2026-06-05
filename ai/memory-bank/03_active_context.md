# Active Context

## Current Objective

Keep OctoAssert docs, specs, and AI memory synchronized with the current Web UI and executor behavior.

The current product shape is a local Web UI for catalog-driven, JSON-backed API test cases. The most active area is WebSocket test case authoring and debugging.

## Current Stable Behavior

- Test cases live under `testcases/`; catalog/category comes from folder path.
- Test Runner and Test Case Builder both display compatible step result shapes.
- Builder uses auto-increment string `step_id` values (`"1"`, `"2"`, ...); human meaning belongs in `description`.
- Builder supports step drag reorder, run step, run all, save confirmation, toast notifications, and JSON validation.
- WebSocket uses a single `websocket` step with ordered `operations`.
- WebSocket operation types are `send`, `await`, and `collect`.
- WebSocket operations support `disabled: true`; UI exposes this as a `Run` checkbox.
- Builder accepts `${ctx.xxx}` context placeholders, including unquoted placeholders in JSON editors for convenience.
- Runner preserves placeholder value types when the placeholder is the whole JSON value.
- WebSocket send payloads are normalized so `Type` / `type` is the first JSON key before write.
- WebSocket executor records per-operation runtime logs in `StepResult.raw_payload.operation_logs`.
- Operation Log UI uses tabs per operation and displays actual payload/timing/matched/collected details.
- Matched and collected messages should display raw message strings when available to preserve field order.

## Recent Work To Preserve

- Added unified `Step Log` dialog across all UI modes (Test Case Builder, Test Runner, Batch Runner).
- Step Log displays Payload, Response (with gRPC code), Asserts, Exports, and per-operation WebSocket logs.
- Moved Batch Runner and Test Runner UI logic to rely on the globally exported dialog functions.
- Changed icon-only buttons to outline text buttons across the board for visual consistency.
- Added typed context injection safeguards for `${ctx.roomid}` and compatibility for old `${ctx.ctx.roomid}` values.
- Added WebSocket operation runtime log fields:
  - `payload_raw`
  - `sent_at`
  - `matched_message_raw`
  - `collected_messages_raw`
  - `elapsed_ms`
- Added operation disable support in UI and executor.

## Important Design Notes

- The Step Log UI components must remain consistent across the three runner views (Test Runner, Batch Runner, Test Case Builder). Do not maintain separate HTML implementations.
- Do not reintroduce older WebSocket step types such as `websocket_connect`, `websocket_send`, or `websocket_close`; current design is one `websocket` step with operations.
- Do not display received WebSocket messages only through parsed/re-stringified JSON when protocol/debug order matters; prefer raw fields.
- Do not generate `${ctx.ctx.xxx}` in UI autocomplete.
- Do not silently fallback invalid JSON payloads to `{}`; validation should tell the user, except for supported unquoted context placeholders.

## Reference Specs

- `README.md`
- `docs/design/01_catalog_spec.md`
- `docs/design/03_websocket_executor_spec.md`
- `docs/design/06_web_ui_spec.md`
- `ai/instructions.md`
- `ai/memory-bank/02_system_design.md`

## Next Useful Follow-Ups

- Add browser-level UI smoke tests for Builder WebSocket operation logs.
- Continue keeping docs in sync whenever executor schema or UI behavior changes.
