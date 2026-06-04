# System Design

本文件定義高階技術選型、系統拓樸與元件職責。具體實作細節交由 `docs/design/` 規格書定義。

## 高階拓樸

```text
Web UI
  -> Test Case Catalog
  -> Runner Orchestrator
      -> gRPC Unary Executor
      -> WebSocket Executor
      -> HTTP Executor
      -> DB Check Executor
      -> Delay Executor
      -> Include Executor
      -> Group Executor
      -> Fake HTTP Server Executor
      -> Fake gRPC Server Executor
  -> Run Store (SQLite / in-memory)
```

## 技術選型

### Web UI

統一操作介面，前端靜態檔案 embed 進 binary，`make serve` 啟動後直接開瀏覽器使用。

### JSON Test Case

Test case 的 source of truth，以本地 JSON 描述測試步驟與預期結果，納入 Git 版控。

### Group

純粹的 step 集合，放在 `testcases/*/groups/`，不被 catalog 掃描。讓多個 test case 共用重複的步驟序列，不需要拆出獨立 test case 檔案。

### Run Store

支援兩種模式：
- **SQLite**（預設）：持久化到 `data/runs.db`，重啟後保留紀錄
- **in-memory**：`make serve-mem` 啟動，重啟後清空

### gRPC Unary

採用 `jhump/protoreflect` 動態引擎，透過 **Server Reflection** 解析服務與 method，不需要提前編譯 `.proto` 檔案。

### WebSocket

內建背景 goroutine 與記憶體佇列，支援 connect / send / await / close 四種 step type。`await` 採先進先出配對截斷策略。

### HTTP

標準 `net/http` client，固定 10 秒 timeout，ResponseSummary 包含 `status_code` 與 `body`。

### DB Check

內部狀態檢查（white-box check），支援 `postgres` / `mysql` / `sqlite`，查詢結果動態轉 JSON，以 `row_count` + `rows` 回傳。

### Include

支援引入 JSON test case（共享 ExecutionContext）或 YAML config（透過 exports 注入 context 變數）。

### Fake Servers

本地假服務，讓 test case 不依賴外部真實服務：
- **fake_http_start / fake_http_stop**：啟動/關閉本地 HTTP server，依 routes 設定回傳固定 response
- **fake_grpc_start / fake_grpc_stop**：啟動/關閉本地 gRPC server，用 `protoparse` 動態載入 `.proto` 並支援 Server Reflection，依 responses 設定回傳固定 JSON

## Runner 分工

- **Runner Orchestrator**：步驟調度、跨步驟 context 管理（`${ctx.xxx}` 注入）、assert 與 export 處理、結果彙整
- 各 executor 只負責自己的 step type，不知道 runner 存在

後續新增 step 類型應新增 executor，不修改 orchestrator。

## 專案目錄結構

```text
/
├── cmd/console/               # 進入點
├── config/                    # 環境設定 YAML，供 include 載入
│   └── fake.yaml              # fake server 設定（port、addr、db dsn）
├── internal/
│   ├── api/                   # Web UI 後端 API
│   │   └── web/               # Web UI 前端靜態資源 (透過 go:embed 打包)
│   ├── catalog/               # Test case 掃描與分類
│   ├── runner/                # Runner Orchestrator
│   ├── executor/              # 各類 executor
│   │   ├── grpcunary/
│   │   ├── websocket/
│   │   ├── httpreq/
│   │   ├── dbcheck/
│   │   ├── delay/
│   │   ├── include/
│   │   ├── group/
│   │   ├── fakehttpserver/
│   │   └── fakegrpcserver/
│   ├── store/                 # Run Store（SQLite / in-memory）
│   └── testcase/              # TestCase + GroupFile model
├── pkg/
│   ├── grpc/
│   ├── ws/
│   ├── httpclient/
│   ├── sqlite/
│   └── jsonpath/
├── proto/                     # .proto 定義，依用途隔離
│   └── fake/                  # fake server 測試用 proto
│       └── service.proto
├── testcases/                 # JSON test case，進版控
│   └── fake/                  # 使用 fake server 的 test case
│       ├── groups/            # 共用 step 群組定義
│       ├── sample/            # 各 executor 示範
│       └── smoke/             # 快速健康確認
├── data/                      # 本地執行紀錄，不進版控
└── Makefile
```
