# WebSocket Executor Spec

WebSocket executor handles one complete WebSocket interaction inside a single `websocket` step.

The step opens a connection, runs an ordered `operations` array, records per-operation runtime logs, returns collected messages, and closes the connection when the step finishes.

## Responsibilities

In scope:

- Dial one WebSocket URL.
- Apply optional headers.
- Execute `send`, `await`, and `collect` operations in order.
- Maintain an in-memory receive queue.
- Export values during `await` and `collect`.
- Inject `${ctx.xxx}` placeholders into outbound payloads immediately before sending.
- Record runtime operation logs for debugging.
- Always close the connection at the end of the step.

Out of scope:

- Long-lived WebSocket sessions across steps.
- Multiple concurrent WebSocket connections inside one step.
- Domain-specific protocol decoding beyond JSON/path matching.

## Step Schema

```json
{
  "step_id": "2",
  "type": "websocket",
  "description": "Connect and subscribe",
  "action": {
    "url": "ws://127.0.0.1:8080/api/v1/external/connect?ticket=${ctx.ticket}",
    "headers": {
      "Authorization": "Bearer ${ctx.token}"
    },
    "operations": []
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `action.url` | string | yes | WebSocket URL. Context placeholders are supported. |
| `action.headers` | object | no | Request headers. Context placeholders are supported. |
| `action.operations` | array | yes | Ordered operation list. |

## Operation Schema

Common fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | no | Human-friendly operation id shown in UI tabs/logs. |
| `description` | string | no | Operation description. |
| `type` | string | yes | `send`, `await`, or `collect`. |
| `disabled` | bool | no | When `true`, executor skips this operation and records it as `skipped`. |

### send

```json
{
  "id": "3",
  "description": "Subscribe to exported room",
  "type": "send",
  "payload": {
    "Type": "subscribe",
    "Room": "${ctx.roomid}"
  }
}
```

Behavior:

- The payload is injected with current context values at execution time.
- If the placeholder occupies the whole JSON value, the runner preserves the exported value type.
- Example: if `ctx.roomid` is numeric `4`, `Room` is sent as `4`, not `"4"`.
- Before writing the WebSocket frame, object payloads are normalized so `Type` or `type` is the first JSON field.
- Operation log records:
  - `payload_raw`
  - parsed `payload`
  - `sent_at`
  - `elapsed_ms`

### await

```json
{
  "id": "2",
  "description": "Wait for page push",
  "type": "await",
  "match": {
    "path": "Type",
    "equals": "presence.page"
  },
  "timeout_ms": 5000,
  "exports": [
    {
      "path": "Payload.E.0.S",
      "as": "ctx.roomid"
    }
  ]
}
```

Behavior:

- The background reader appends incoming messages to an in-memory queue.
- `await` checks queued messages every 50 ms until timeout.
- If `match.path` is empty, the first queued message matches.
- When matched, messages up to and including the matched message are consumed.
- `exports` read from the matched message and immediately write into runner context.
- Later operations in the same WebSocket step can use exported values.

Supported match modes:

```json
{ "path": "Type", "equals": "presence.page" }
{ "path": "Payload.E.0.S", "any": true }
{ "path": "Type", "contains": "presence" }
```

Operation log records:

- match config
- matched message
- `matched_message_raw`
- consumed/collected messages
- `collected_messages_raw`
- timing and timeout

### collect

```json
{
  "id": "4",
  "description": "Collect remaining messages",
  "type": "collect",
  "timeout_ms": 10000,
  "exports": [
    {
      "path": "0.Payload.E.0.S",
      "as": "ctx.first_collected_room"
    }
  ]
}
```

Behavior:

- Waits the full timeout duration.
- Copies all messages currently queued during that window.
- Clears the queue.
- Appends collected messages to `response_summary`.
- `exports` can extract from the array of collected messages.

## Context Placeholders

The runner supports placeholders in action JSON:

```json
{
  "Room": "${ctx.roomid}"
}
```

If the placeholder is the whole string value and the context value is numeric, bool, object, or array, the original type is preserved.

The Test Case Builder also accepts unquoted placeholders in JSON editors:

```json
{
  "Room": ${ctx.roomid}
}
```

The UI normalizes that form into a valid JSON placeholder before saving/running.

Compatibility note:

- `${ctx.roomid}` is the preferred syntax.
- `${ctx.ctx.roomid}` is tolerated during injection for old saved data, but new UI autocomplete should not generate it.

## Disabled Operations

Operations can be skipped temporarily:

```json
{
  "id": "3",
  "type": "send",
  "disabled": true,
  "payload": {
    "Type": "subscribe",
    "Room": "${ctx.roomid}"
  }
}
```

The executor records the operation as:

```json
{
  "status": "skipped",
  "disabled": true
}
```

In the Web UI, each operation has a `Run` checkbox. Unchecking it saves `disabled: true`.

## Response Summary

`response_summary` is a JSON array containing messages produced by successful `await` and `collect` operations.

The executor uses raw WebSocket messages where possible so response payloads keep the received field order.

Example:

```json
[
  {
    "Type": "presence.page",
    "Payload": {
      "E": []
    }
  }
]
```

## Raw Payload / Operation Log

The executor stores per-operation runtime logs in `StepResult.raw_payload`:

```json
{
  "operation_logs": [
    {
      "index": 1,
      "id": "3",
      "type": "send",
      "status": "sent",
      "started_at": "2026-06-05T16:00:00.000+08:00",
      "sent_at": "2026-06-05T16:00:00.001+08:00",
      "finished_at": "2026-06-05T16:00:00.001+08:00",
      "elapsed_ms": 1,
      "payload_raw": "{\"Type\":\"subscribe\",\"Room\":4}",
      "payload": {
        "Type": "subscribe",
        "Room": 4
      }
    }
  ]
}
```

Operation statuses:

| Status | Meaning |
| --- | --- |
| `skipped` | Operation had `disabled: true`. |
| `sent` | Send operation wrote a WebSocket text frame. |
| `matched` | Await operation matched and consumed messages. |
| `collected` | Collect operation finished and drained queued messages. |
| `failed` | Operation failed or timed out. |

For received messages, logs include raw fields:

- `matched_message_raw`
- `collected_messages_raw`

The Web UI displays those raw fields first so field order matches the received WebSocket frame, not a re-stringified object.

## Error Semantics

- Dial failure: step fails immediately.
- Unknown operation type: step fails.
- `send` write failure: step fails.
- `await` timeout: step fails.
- `collect` timeout is expected behavior; it waits the full timeout and passes.
- On failure, operation logs collected so far are still attached to `raw_payload`.
