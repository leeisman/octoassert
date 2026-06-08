# X-Ray 分散式追蹤與結構化日誌計畫 (X-Ray Distributed Tracing & Structured Logging Plan)

本文件定義了 OctoAssert 中關於「確定性追蹤 (Deterministic tracing)」與「結構化日誌 (Structured logging)」的實作方向與規範。

我們的核心目標是：讓每一次 Web UI 的執行、後端 Runner 的排程、Executor 的動作，以及底層通訊協定（Protocol）的除錯細節，全部都能透過一組唯一的 `run_id` 串聯並追蹤。

## 決策總結

- 使用 Go 官方標準函式庫 `log/slog` 進行結構化日誌紀錄。
- 後端日誌預設輸出格式為 **JSON**，以便於機器過濾與解析。
- 支援透過環境變數設定輸出為純文字（Text Logs），以提升本地開發時的人類可讀性。
- 為每一次的測試執行請求（Execution request）產生一組全域唯一的 `run_id`。
- 將 `run_id` 注入後端 Context 脈絡中，並將其附加於回傳給前端的執行結果（RunResult）內。
- 於 Web UI 介面上顯示 `run_id`，讓使用者能直接拿它去後端日誌中搜尋。
- 實作順序上：先從 Runner 層級與 WebSocket Executor 開始導入，後續再擴展至其他類型的 Executor。

## 對原先提案的重要修正

### slog 版本說明
`log/slog` 是自 Go 1.21 起就正式加入標準函式庫的，並非 Go 1.25 才引入。

### RunResult 的定義位置
`RunResult` 結構定義於以下檔案：
```text
internal/runner/model.go
```
請**不要**將 `run_id` 加錯地方（例如 `internal/testcase`）。

### slog 的 Context 行為
呼叫 `slog.InfoContext(ctx, ...)` 並不會「自動」把存在 `context.Context` 裡面的所有值印出來。
如果我們使用 `context.WithValue` 儲存了 `run_id`，它不會自動出現在日誌裡，除非我們撰寫一個 Logger Helper 顯式地將它抽出來並當作 slog 的屬性（Attribute）附加進去。

建議作法：
```go
observability.Info(ctx, "executor_start", "step_id", step.StepID, "type", step.Type)
```
此 Helper 函數應負責從 Context 中讀取 `run_id`，並自動附加到每一行輸出的日誌中。

## 系統設定 (Configuration)

在應用程式啟動時加入日誌的相關設定。

建議新增的環境變數：
```text
OCTOASSERT_LOG_FORMAT=json|text
OCTOASSERT_LOG_LEVEL=debug|info|warn|error
OCTOASSERT_LOG_SOURCE=true|false
```

建議的預設值：
```text
OCTOASSERT_LOG_FORMAT=json
OCTOASSERT_LOG_LEVEL=info
OCTOASSERT_LOG_SOURCE=true
```
- **JSON 日誌** 建議作為預設值，因為它允許使用者輕易透過 `run_id`、`step_id`、`executor` 等欄位進行精準過濾與查詢。
- **Text 日誌** 則保留給開發人員在本地端直接觀看終端機輸出時使用。

## 獨立套件規劃 (Proposed Package)

建立一個小型的可觀測性（Observability）專用套件：
```text
internal/observability/
  context.go
  logger.go
  redaction.go
```

職責範圍：
- 定義用於存取 `run_id` 的 Context Keys。
- 負責產生 `run_id`。
- 負責在 Context 中附加與讀取 `run_id`。
- 初始化全域的 `slog.Logger`。
- 提供日誌輔助函數：
  - `Debug(ctx, msg, args...)`
  - `Info(ctx, msg, args...)`
  - `Warn(ctx, msg, args...)`
  - `Error(ctx, msg, args...)`
- 針對機密資料進行遮蔽（Redaction / Sanitize）。
- 針對過大的 Payload 進行截斷（Truncate）。

## Run ID 格式規範

使用穩定且易於搜尋的格式：
```text
run_<uuid>
```
例如：
```text
run_018f4ff8-5d95-7b91-97da-9174bc643b10
```
可以使用專案中既有的 UUID 套件來產生。
若想避免引入外部依賴，也可直接使用 `crypto/rand` 產生 16 bytes 並格式化為 Hex 字串。

## API 層級變更 (API Layer Changes)

為每一個執行 API 都產生一組 `run_id`：
```text
POST /api/run
POST /api/builder/run
POST /api/builder/run-step
```
> **注意：** 不能只在 `/api/run` 產生 ID，Test Case Builder 內的執行（包含單步執行）也必須能被追蹤！

建議流程：
1. API Handler 接收到執行請求。
2. 產生一組 `run_id`。
3. 將其附加到 Request 的 Context 中。
4. 將這個 Context 傳遞給底層的 Runner 引擎。
5. 將 `run_id` 包含在 Response 裡面回傳給前端。

涉及修改的檔案：
```text
internal/api/server.go
internal/api/builder.go
```

## Runner 引擎變更 (Runner Changes)

需修改的檔案：
```text
internal/runner/model.go
internal/runner/runner.go
```

在 `RunResult` 擴充欄位：
```go
RunID string `json:"run_id,omitempty"`
```

Runner 的職責包含：
- 從 Context 中讀取 `run_id`。
- 賦值給 `RunResult.RunID`。
- 紀錄 `run_start` 日誌。
- 在每個 Step 執行前，紀錄 `executor_start` 日誌。
- 在每個 Step 執行後，紀錄 `executor_done` 日誌。
- 紀錄 `run_done` 日誌。
- 若 Step 發生錯誤，紀錄 `run_failed` 日誌。

建議的 Runner Event 日誌欄位：
```text
event
run_id
test_case_id
step_index
step_id
step_type
step_description
status
elapsed_ms
error
```
> **注意：** 預設情況下，Runner 層級的日誌**不應該**印出完整且龐大的 JSON Payload，請紀錄「摘要（Summaries）」以保持日誌乾淨。

## 敏感資料與 Payload 紀錄策略 (Payload Logging Policy)

預設**嚴禁**無限制地印出所有 Input / Output 的原始資料。

風險：
- WebSocket 可能會收集到極度龐大的訊息陣列。
- HTTP Headers 或 Metadata 內可能包含 Authorization Tokens 或密碼。
- 原始日誌會變得充滿雜訊，導致難以查詢。

建議策略：
- **Info 等級** 的日誌僅包含摘要。
- **Debug 等級** 可包含經過遮蔽（Sanitized）與截斷（Truncated）後的 Payload。
- 所有的敏感欄位都必須被遮蔽（Redacted）。
- 字串長度若過長，應進行截斷（例如限制在 4096 bytes 內）。

必須遮蔽的敏感 Key 清單（需不分大小寫）：
```text
authorization
cookie
set-cookie
password
passwd
token
access_token
refresh_token
ticket
secret
dsn
```

遮蔽範例：
```json
{
  "authorization": "[REDACTED]",
  "payload_bytes": 128
}
```

## Executor 變更 (Executor Changes)

不需要一次性重構所有的 Executor。

建議分階段上線（Phased Rollout）：

### 第一階段 (Phase 1)
- 導入 Runner 生命週期日誌。
- API `run_id` 產生邏輯。
- 前端 Web UI 顯示 `run_id`。
- 導入 WebSocket Executor 及其 Operation Log 紀錄。

### 第二階段 (Phase 2)
- 導入 gRPC Executor 協定層級日誌。
- 導入 HTTP Executor 協定層級日誌。
- 導入 DB Executor 查詢摘要日誌。
- 導入 Include / Group / Fake Server 等輔助類型的生命週期日誌。

Executor 輸出的日誌應包含以下欄位：
```text
run_id
step_id
executor
operation_id
operation_type
endpoint/url/driver
status
elapsed_ms
error
```

針對 WebSocket Executor 的特別要求：
- 紀錄連線開始、成功、失敗（connect start/done/failure）。
- 發送操作（send）只在 Payload 經過遮蔽與截斷後才印出 `payload_raw`。
- 紀錄等待比對（await match）與超時（timeout）。
- 紀錄訊息收集數量（collect count）。
- 紀錄斷線（close）。

## WebSocket 操作日誌 (WebSocket Operation Logs)

既有的 WebSocket `StepResult.raw_payload.operation_logs` 應繼續保留，作為 Web UI 顯示 Operation 細節的主要來源。
後端日誌的作用是「輔助與追蹤」，**不可取代**既有架構。

重要提醒：
- `payload_raw` 必須保留**實際送出時的欄位順序**。
- `matched_message_raw` 與 `collected_messages_raw` 必須保留**實際接收時的欄位順序**。
- 在 Debug 協定層級的問題時，絕對不能只給出重新 Stringify 過、順序被打亂的 JSON 物件。

操作日誌建議欄位：
```json
{
  "index": 1,
  "id": "3",
  "type": "send",
  "status": "sent",
  "started_at": "...",
  "sent_at": "...",
  "finished_at": "...",
  "elapsed_ms": 1,
  "payload_raw": "{\"Type\":\"subscribe\",\"Room\":4}",
  "payload": {
    "Type": "subscribe",
    "Room": 4
  }
}
```

## 前端變更 (Frontend Changes)

需修改的檔案：
```text
internal/api/web/app.js
internal/api/web/index.html
internal/api/web/style.css
```

在以下地方顯示 `run_id`：
- Test Runner 的執行資訊列（Run info bar）。
- Builder 的執行結果區塊。
- Operation Log 的 Modal Header。
- JSON Tree 的 Modal Header（如果有的話）。

行為要求：
- `run_id` 必須可以被滑鼠選取複製。
- 最好旁邊提供一個快速「複製」的小圖示。
- 若舊的測試結果沒有 `run_id`，前端介面不應該報錯或跑版。

顯示範例：
```text
Run ID: run_018f4ff8-5d95-7b91-97da-9174bc643b10
```

## 範例 JSON 日誌輸出 (Example JSON Log Lines)

```json
{
  "time": "2026-06-08T12:00:00.000+08:00",
  "level": "INFO",
  "source": {
    "function": "octoassert/internal/runner.(*Runner).RunWithContext",
    "file": "internal/runner/runner.go",
    "line": 42
  },
  "msg": "executor_start",
  "run_id": "run_018f4ff8-5d95-7b91-97da-9174bc643b10",
  "test_case_id": "player_websocket_operations",
  "step_id": "2",
  "step_type": "websocket"
}
```

```json
{
  "time": "2026-06-08T12:00:00.120+08:00",
  "level": "INFO",
  "msg": "websocket_operation_done",
  "run_id": "run_018f4ff8-5d95-7b91-97da-9174bc643b10",
  "step_id": "2",
  "operation_id": "3",
  "operation_type": "send",
  "status": "sent",
  "elapsed_ms": 1,
  "payload_bytes": 29
}
```

## 驗證計畫 (Verification Plan)

### 自動化驗證 (Automated)
新增或更新以下測試案例：
- `RunResult` 中確實包含 `run_id`。
- Builder 的單步執行（run-step）能回傳 `run_id`。
- Builder 的完整執行（run-all）能回傳 `run_id`。
- `/api/run` API 能回傳 `run_id`。
- observability helper 能成功將 Context 中的 `run_id` 附加到 slog 輸出。
- redaction 功能確實能將敏感字串遮蔽為 `[REDACTED]`。
- truncation 功能確實能限制超大 Payload 的輸出字數。

### 人工驗證 (Manual)
1. 啟動伺服器：
```bash
go run . server console --db data/runs.db
```
2. 從 Test Runner 中執行一個已經存檔的 Test Case。
3. 確認 Web UI 上方有顯示 `Run ID`。
4. 複製該 ID，前往伺服器終端機搜尋該 `run_id`。
5. 確認終端機日誌是否包含完整的執行生命週期：
   - `run_start`
   - `executor_start`
   - `executor_done`
   - `run_done` 或 `run_failed`
6. 從 Builder 畫面執行一個 WebSocket Test Case。
7. 開啟 Operation Log，確認 UI 上的 `Run ID` 與後端一致。
8. 檢查介面上是否依然可以看見原始的 Payload 與 Collected Messages（確認既有功能未被破壞）。

## 非目標 (Non-Goals)
- 目前階段**不引入** OpenTelemetry (OTEL)。
- 此階段**不實作**將日誌即時推播（Stream）到前端的功能。
- **絕對不要**無限制地印出機密資料或數 MB 大小的 Payload。
- 不需要架設額外的日誌收集系統（如 ELK、Datadog），單純透過文字與 grep 即須能達成目的。

## 建議實作順序 (Recommended Implementation Order)
1. 建立 `internal/observability` 套件與 Helper。
2. 於 App 啟動時（`main.go`）初始化 slog。
3. 將 `RunID` 加入 `runner.RunResult` 結構。
4. 於所有的執行 API Handlers 實作產生 `run_id` 的邏輯。
5. 將 `run_id` 注入 Request Context。
6. 在 Runner 核心實作生命週期的日誌紀錄。
7. 修改前端 Web UI，在介面上顯示 `Run ID`。
8. 實作 WebSocket Executor 的日誌紀錄機制。
9. 撰寫 Redaction（資料遮蔽）與 Truncation（長度截斷）的單元測試。
10. 階段性地將日誌機制推廣至其他 Executors（gRPC、HTTP 等）。
