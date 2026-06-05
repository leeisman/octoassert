# OctoAssert

🚀 **OctoAssert** 是一個專為現代微服務架構打造的**多協議端對端 (E2E) API 自動化測試引擎**。

它能讓你輕鬆編排橫跨 **gRPC、HTTP、WebSocket 與資料庫 (DB)** 的複雜測試劇本，並提供極具未來感的 **「深色毛玻璃 (Glassmorphism)」Web UI**，讓測試流程不再是枯燥的程式碼，而是清晰可見、可視覺化編輯的活文件！

---

## ✨ 核心特色 (Highlights)

- **🌟 旗艦級 Web UI**
  - 內建精美的深色模式 Web 介面（透過 `go:embed` 無縫打包進執行檔）。
  - **左右並排的 Horizontal Collapse 佈局**：左側編輯設定，右側高亮顯示高達 600px 的巨型 JSON 執行結果，完美支援寬螢幕。
  - 右鍵選單支援快速複製、執行與進入 Test Case Builder 編輯。
- **🔌 真正的多協議支援 (Multi-Protocol)**
  - **gRPC Unary**：內建 Server Reflection 動態反射機制，**無需預先編譯或上傳 `.proto` 檔案**，直接呼叫！
  - **WebSocket**：獨創背景 Goroutine 與記憶體佇列，完美解決非同步推播的驗證難題（支援 `connect`, `send`, `await`, `close` 流程）。
  - **RESTful HTTP**：標準 HTTP API 呼叫支援。
  - **DB Check (White-box Testing)**：支援原生 Postgres、MySQL、SQLite 查詢，並透過**動態指標映射 (Dynamic Row Mapping)** 直接把查詢結果轉為 JSON 供斷言。
- **🤖 內建 Fake Servers**
  - 不依賴外部環境！內建 `fake_http_server` 與 `fake_grpc_server`，測試劇本可以自行啟動假伺服器來模擬相依服務的回應。
- **💡 測試即文件 (Test as Documentation)**
  - 使用純 JSON 宣告式語法編寫測試，並透過 `${ctx.xxx}` 跨步驟傳遞變數（Exports）。

---

## 🚀 快速開始 (Quick Start)

你只需要安裝好 Go 環境，即可一鍵啟動：

```bash
# 啟動（使用 SQLite 持久化儲存測試紀錄）
make serve

# 啟動（使用 In-Memory 模式，重啟後清空紀錄）
make serve-mem
```

啟動後，請開啟瀏覽器前往：**[http://127.0.0.1:7788](http://127.0.0.1:7788)** ，迎接你的全新測試體驗！

---

## 🛠 支援的執行器字典 (Executor Types)

| 執行器類型 | 說明 |
|---|---|
| `grpc_unary` | 執行 gRPC Unary 呼叫，支援動態 Server Reflection。 |
| `http_request` | 執行標準 HTTP RESTful API 請求。 |
| `websocket_connect` | 建立 WebSocket 連線，產生背景守護行程負責收發訊息。 |
| `websocket_send` | 透過已建立的 WebSocket 連線發送訊息。 |
| `websocket_await` | 阻塞等待符合特定 JSONPath 條件的 WebSocket 推播訊息。 |
| `websocket_close` | 關閉連線並清理背景資源。 |
| `db_check` | 執行 SQL 查詢驗證資料庫內部狀態。 |
| `delay` | 讓測試流程暫停指定的毫秒數。 |
| `include` | 載入 YAML Config，或插入其他 JSON Test Case 作為 Sub-routine。 |
| `group` | 引入共用步驟群組，避免重複撰寫相同的流程。 |
| `fake_grpc_start` | 啟動本機假 gRPC Server，依據設定回傳 Mock JSON。 |
| `fake_http_start` | 啟動本機假 HTTP Server，依據路由回傳 Mock JSON。 |

---

## 📝 Test Case 語法範例

Test Case 統一以 JSON 格式儲存於 `testcases/` 目錄下，納入 Git 版本控制，與程式碼共存亡。

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

> **變數傳遞小技巧**：在上述 `exports` 中，可以將 Response 提取存入 Context，隨後在後面的步驟中使用 `${ctx.room_status}` 取出，輕鬆串聯複雜的業務邏輯！

---

## 📂 專案結構

```text
/
├── config/          # 環境設定（供 include 載入）
├── testcases/       # JSON Test Case 腳本目錄（進版控）
├── docs/design/     # 各模組的詳細規格書
├── ai/memory-bank/  # AI 輔助開發的架構脈絡與上下文
├── internal/
│   ├── api/         # Web UI 後端 API 與靜態資源 (go:embed)
│   ├── catalog/     # 負責掃描與解析 Test Case
│   ├── runner/      # 核心調度引擎 (Runner Orchestrator)
│   ├── executor/    # 10+ 種以上的執行器實作
│   ├── store/       # 執行紀錄儲存 (SQLite / Memory)
│   └── testcase/    # TestCase 資料模型
└── main.go          # CLI 與 Server 啟動入口
```

---

## 📐 核心設計原則

1. **資料驅動 (Data-Driven)**：新增測試劇本只需要撰寫 JSON，不需要修改任何 Go 程式碼。
2. **無縫整合 (Zero-Config GUI)**：Web UI 與後端引擎在同一個 Binary 中，不依賴龐大的前端建置工具鏈。
3. **黑盒與白盒的完美結合 (Blackbox + Whitebox)**：透過 gRPC/HTTP/WS 驗證外部結果，結合 `db_check` 深入驗證內部資料狀態。
