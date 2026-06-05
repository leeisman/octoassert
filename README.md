# OctoAssert

OctoAssert is a local Web UI for building, running, and debugging multi-protocol API test cases.

It is designed for backend and game-service workflows where one scenario may need to call HTTP, gRPC, WebSocket, DB checks, fake servers, and reusable groups in a single executable test case.

## Highlights

- Web UI first: browse the catalog, edit test cases, run steps, inspect results, and save changes from the browser.
- JSON test cases: all test definitions live under `testcases/` and can be versioned with the project.
- Multi-protocol execution: `grpc_unary`, `http_request`, `websocket`, `db_check`, `delay`, `include`, `group`, `fake_grpc_start`, `fake_grpc_stop`, `fake_http_start`, and `fake_http_stop`.
- Context passing: exports write values such as `ctx.roomid`; later steps can use `${ctx.roomid}`.
- WebSocket operation logs: each WebSocket step records per-operation runtime details, including sent payload, sent time, match results, collected messages, skipped operations, and elapsed time.
- Catalog management: folder-based categories, duplicate, delete, multi-select actions, drag sorting, expand/collapse, and edit-in-builder.
- Builder ergonomics: step drag reorder, run one step, run all, JSON validation, context autocomplete, operation disable toggles, and save confirmation.

## Quick Start

```bash
make serve
```

Open:

```text
http://127.0.0.1:7788
```

Use in-memory run storage instead of SQLite:

```bash
make serve-mem
```

Run tests:

```bash
make test
```

Manual server command:

```bash
go run . server console --addr 127.0.0.1:7788 --db data/runs.db
```

## Test Case Layout

Catalog categories are derived from folders, not from a JSON field.

```text
testcases/
  baccarat/
    player/
      player_websocket_operations.json
    groups/
      login.json
  fake/
    sample/
      sample_grpc.json
```

For example, `testcases/baccarat/player/player_websocket_operations.json` appears in catalog `baccarat/player`.

## Test Case Schema

```json
{
  "id": "player_websocket_operations",
  "name": "Player WebSocket Operations",
  "description": "Login, connect WebSocket, send player operations, and inspect pushed messages.",
  "config": {
    "timeout_ms": 15000
  },
  "steps": [
    {
      "step_id": "1",
      "type": "group",
      "description": "Reuse login group and export ticket",
      "action": {
        "file": "testcases/baccarat/groups/login.json"
      }
    },
    {
      "step_id": "2",
      "type": "websocket",
      "description": "Connect with ticket and subscribe to room",
      "action": {
        "url": "ws://127.0.0.1:8080/api/v1/external/connect?ticket=${ctx.ticket}",
        "operations": [
          {
            "id": "1",
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
          },
          {
            "id": "2",
            "description": "Subscribe to exported room",
            "type": "send",
            "payload": {
              "Type": "subscribe",
              "Room": "${ctx.roomid}"
            }
          },
          {
            "id": "3",
            "description": "Collect pushed messages",
            "type": "collect",
            "timeout_ms": 10000
          }
        ]
      }
    }
  ]
}
```

## Context Placeholders

Exports should usually store names with the `ctx.` prefix:

```json
{
  "path": "Payload.E.0.S",
  "as": "ctx.roomid"
}
```

Later payloads can reference that value:

```json
{
  "Type": "subscribe",
  "Room": "${ctx.roomid}"
}
```

The runner preserves the exported value type. If `ctx.roomid` is numeric, the sent payload will contain a numeric `Room`, not a string.

In the Test Case Builder payload editor, unquoted context placeholders are also accepted for convenience:

```json
{
  "Type": "subscribe",
  "Room": ${ctx.roomid}
}
```

Before save/run, the UI normalizes this to a valid JSON placeholder and the runner injects the typed value at execution time.

## WebSocket Operations

A `websocket` step opens one connection, runs `operations` sequentially, then closes the connection.

Supported operation types:

| Type | Behavior |
| --- | --- |
| `send` | Sends a JSON payload. Context placeholders are injected immediately before write. |
| `await` | Waits until a queued message matches `match`. Matching messages are consumed from the queue. |
| `collect` | Waits the full timeout and returns all messages received in that window. |

Operations can be temporarily skipped:

```json
{
  "id": "2",
  "type": "send",
  "disabled": true,
  "payload": {
    "Type": "subscribe",
    "Room": "${ctx.roomid}"
  }
}
```

The Web UI exposes this as a `Run` checkbox on each operation. Unchecking it saves `disabled: true`.

For outbound WebSocket payloads, `Type` or `type` is ordered as the first JSON field before sending. This keeps runtime logs and protocol-sensitive systems aligned with expected payload order.

## Operation Log

After running a WebSocket step in the builder, the Step Response header includes:

- Operation Log: tabbed per-operation runtime log.
- Open JSON Tree: collapsible response viewer.

The Operation Log shows:

- operation id/type/status
- start, sent, finish time
- elapsed time
- actual sent payload
- match configuration
- matched message
- collected messages
- full raw operation log JSON

Collected and matched messages are displayed from raw WebSocket frames when available, so field order matches what was actually received instead of a re-stringified object.

## Catalog And Builder

Catalog behavior:

- Categories come from folders under `testcases/`.
- Test cases can live at root or nested paths.
- Supports duplicate, delete, bulk delete/move, folder delete, drag sorting, expand all, collapse all, and edit in builder.

Builder behavior:

- `step_id` is auto-numbered as `"1"`, `"2"`, `"3"`, etc.
- Human-readable meaning belongs in `description`.
- Steps can be dragged to reorder.
- WebSocket operations can be reordered and disabled.
- JSON editors validate before save, with support for context placeholders.
- Save and run actions use toast notifications.

## Project Structure

```text
/
├── ai/                       # AI collaboration instructions and memory bank
├── config/                   # Environment/config files used by include steps
├── data/                     # Local run store, usually ignored
├── docs/design/              # Design specs for catalog, executors, Web UI, and store
├── internal/
│   ├── api/                  # HTTP API and embedded Web UI
│   ├── catalog/              # Test case discovery and folder/category handling
│   ├── consoleapp/           # Local console server app wiring
│   ├── executor/             # Executor implementations
│   ├── runner/               # Step orchestration, assertions, exports, context injection
│   ├── store/                # Run storage
│   └── testcase/             # Test case models
├── proto/                    # Local proto files used by fake/test services
├── testcases/                # JSON test cases and group files
├── main.go                   # CLI entrypoint
└── Makefile
```

## Documentation

Primary specs live under `docs/design/`.

Start with:

- `docs/design/01_catalog_spec.md`
- `docs/design/03_websocket_executor_spec.md`
- `docs/design/06_web_ui_spec.md`
- `ai/instructions.md`
- `ai/memory-bank/02_system_design.md`
