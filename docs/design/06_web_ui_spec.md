# Web UI Spec

The Web UI is the primary OctoAssert interface. It manages the catalog, edits test cases, runs steps or full test cases, and inspects runtime results.

Frontend files are embedded in the Go binary from `internal/api/web/`.

## Top-Level Views

The UI has two main tabs:

| Tab | Purpose |
| --- | --- |
| Test Runner | Browse catalog, inspect saved JSON, execute a saved test case. |
| Test Case Builder | Create or edit a test case with structured controls. |

Switching to Test Case Builder normally starts a fresh draft. Editing from Test Runner loads the selected test case into Builder.

## Catalog

Catalog is derived from folders under `testcases/`.

Capabilities:

- nested folders as categories
- root-level test cases
- expand/collapse folders
- expand all / collapse all
- duplicate test case
- delete test case
- delete folder
- multi-select mode for bulk move/delete
- drag sorting for folders/test cases where supported
- edit selected case in Builder

The displayed category should match the filesystem path relative to `testcases/`.

## Test Runner

Runner displays:

- selected test case title
- editable saved test case JSON
- execution steps
- selected step request
- selected step result

The Test Case JSON panel supports direct editing. Save is allowed only when the content is valid JSON and contains a valid test case object.

`Execute Run` calls `/api/run` and streams progress with NDJSON when supported:

```http
Accept: application/x-ndjson
```

The runner marks steps as `pending`, `running`, `passed`, or `failed`, then renders the final `RunResult`.

## Test Case Builder

Builder supports structured editing for all executor types.

General behavior:

- `step_id` is auto-numbered as `"1"`, `"2"`, `"3"`, etc.
- `description` holds the human-readable meaning.
- Steps can be reordered by drag/drop.
- Individual steps can be run with `Run Step`.
- All steps can be run with `Run All`.
- Save shows a confirmation dialog with final JSON.
- Save success/failure and run success/failure use toast notifications.
- JSON editors validate before save/run.
- Context suggestions appear when typing `$` in supported inputs.

Catalog/category field:

- UI label is `Catalog`.
- The value maps to filesystem category under `testcases/`.
- Existing categories can be picked from a dropdown.

## Context Suggestions

Context values come from step exports and are stored in the browser for builder convenience.

When typing `$`, the UI suggests available keys and inserts:

```text
${ctx.name}
```

If a key is already stored as `ctx.name`, autocomplete still inserts `${ctx.name}` and must not produce `${ctx.ctx.name}`.

JSON editors accept both:

```json
{ "Room": "${ctx.roomid}" }
```

and convenience form:

```json
{ "Room": ${ctx.roomid} }
```

The latter is normalized before save/run.

## WebSocket Operation Editor

For `websocket` steps, Builder shows an operations list.

Operation controls:

- add `send`
- add `await`
- add `collect`
- reorder operations
- delete operations
- `Run` checkbox to temporarily disable an operation

Unchecking `Run` writes:

```json
{ "disabled": true }
```

Disabled operations are skipped by both Builder runs and Test Runner execution.

Payload editor:

- uses a plain syntax-highlighted JSON input
- does not show inline tree/collapse controls
- accepts context placeholders
- prevents invalid JSON unless the invalid part is a supported unquoted context placeholder

## Step Response

Builder Step Response should use the same data shape as Test Runner Step Result:

```json
{
  "step_id": "2",
  "type": "websocket",
  "status": "passed",
  "elapsed_ms": 10,
  "response_summary": [],
  "values": {}
}
```

Step Response header may include:

| Button | Visibility | Purpose |
| --- | --- | --- |
| Operation Log | WebSocket results with operation logs | Inspect per-operation payloads, status, and timing. |
| Open JSON Tree | Any step result | Open collapsible JSON tree / raw viewer for the response. |

## Operation Log Dialog

Operation Log uses tabs:

- one tab per operation
- detail panel for selected operation
- summary rows for operation, status, id, timing, timeout, collected count, and errors
- raw payload display
- match display
- matched message display
- collected messages display
- full operation log JSON

Payload display must prefer `payload_raw` to preserve the actual send order.

Matched and collected message display must prefer:

- `matched_message_raw`
- `collected_messages_raw`

This avoids changing field order by parsing and re-stringifying received messages.

## JSON Tree Dialog

The JSON tree dialog is for readability, not for preserving raw field order.

Features:

- tree/raw toggle
- expand all / collapse all
- zoom in / zoom out
- Esc or backdrop click closes the dialog

## File Picker

Proto file inputs support selecting readable external files through the UI. Prefer relative paths when test cases need to run on other machines.

## Toasts And Dialogs

Use toast notifications for transient success/failure messages:

- save completed
- run completed
- run failed
- validation failed

Use dialogs when the user must confirm a destructive or important action:

- delete
- save final JSON confirmation
- invalid JSON in saved Test Runner JSON

## API Contract

Key endpoints:

```text
GET    /api/testcases
GET    /api/testcases/{id}
DELETE /api/testcases/{id}
POST   /api/testcases/{id}/duplicate
POST   /api/testcases/bulk-delete
POST   /api/testcases/bulk-move
POST   /api/testcases/reorder
GET    /api/explore/categories
POST   /api/run
POST   /api/builder/run-step
POST   /api/builder/run
POST   /api/builder/save
```

Execution timeout follows `test_case.config.timeout_ms`, defaulting to 30 seconds when unset.

## Design Principles

- The frontend never implements executor behavior.
- Runner/executor results are the source of truth.
- Builder and Runner should display compatible step result shapes.
- Catalog category should reflect filesystem location.
- Raw runtime payloads/messages should be preserved when debugging protocol order matters.
