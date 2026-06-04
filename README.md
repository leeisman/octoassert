# OctoAssert

多協議 API 自動化測試工具，支援 gRPC、HTTP、WebSocket、DB 等協議，提供本地 Web UI 介面，讓測試流程變成可執行的文件。

## 功能

**Test Runner**
- 執行 JSON test case，支援多步驟流程
- 每次執行自動記錄 request、response、耗時與錯誤

**Test Case Builder**
- Web UI 視覺化建構 test case，無需手寫 JSON
- 支援全部 executor 類型，右鍵從 Catalog 載入既有 test case 編輯

**支援的 Executor**

| 類型 | 說明 |
|---|---|
| `grpc_unary` | gRPC Unary，透過 Server Reflection 自動發現服務，支援 proxy 模式 |
| `http_request` | HTTP RESTful API |
| `websocket_connect/send/await/close` | WebSocket 全流程，背景佇列 |
| `db_check` | 直接查 DB 驗證內部狀態（postgres / mysql / sqlite） |
| `delay` | 等待指定毫秒 |
| `include` | 引入 JSON test case 或 YAML config |
| `group` | 引入共用步驟群組 |
| `fake_grpc_start/stop` | 啟動本地假 gRPC server，不依賴外部服務 |
| `fake_http_start/stop` | 啟動本地假 HTTP server |

## 快速開始

```bash
# 啟動（SQLite 持久化）
make serve

# 啟動（in-memory，重啟後清空）
make serve-mem
```

開啟瀏覽器：[http://127.0.0.1:7788](http://127.0.0.1:7788)

## Test Case 格式

Test case 以 JSON 描述，存放在 `testcases/` 目錄，納入 Git 版控。

```json
{
  "id": "revive_baccarat_room",
  "name": "Revive Baccarat Room",
  "description": "呼叫 ReviveRoom 讓指定房間恢復運行",
  "config": { "timeout_ms": 10000 },
  "steps": [
    {
      "step_id": "call",
      "type": "grpc_unary",
      "action": {
        "endpoint": "localhost:50052",
        "service": "cbm.ClassicalBaccarat",
        "method": "ReviveRoom",
        "payload": { "room_serial": 1 }
      },
      "asserts": [
        { "type": "json_path", "path": "grpc_code", "expect": "OK" }
      ],
      "exports": [
        { "path": "response.status", "as": "ctx.room_status" }
      ]
    }
  ]
}
```

Context 變數用 `${ctx.xxx}` 在後續步驟中引用。

## 專案結構

```
testcases/       # JSON test case，進版控
config/          # 環境設定（供 include 載入）
docs/design/     # 各模組規格書
ai/memory-bank/  # 專案方向與設計脈絡
internal/
  api/           # Web UI 後端 + 靜態資源
  catalog/       # Test case 掃描與分類
  runner/        # Runner Orchestrator
  executor/      # 各類 executor 實作
  store/         # Run Store（SQLite / in-memory）
  testcase/      # TestCase model
```

## 設計原則

- **資料驅動**：新增測試只需寫 JSON，不需改 Go 程式碼
- **測試即文件**：test case 同時是 API 規格與交互說明
- **雙層驗證**：外部結果（API response）+ 內部狀態（DB check）
