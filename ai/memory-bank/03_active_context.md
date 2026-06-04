# Active Context

## 當前唯一目標

所有核心 Spec 已徹底實作完畢，包含 Web UI 的深色毛玻璃介面重構、gRPC 動態反射、DB Check 動態指標映射、以及 WebSocket 的背景佇列機制。接下來準備依據新架構，撰寫真實的端對端 (E2E) Testcases 進行全面驗證，或擴展進階功能。

## 已完成

- **`docs/design/01_runner_spec.md`**: 已重構為「測試劇本 (JSON Schema) 總覽字典」，提供所有 Step Type 的完整 JSON 範例。
- **`docs/design/02_testcase_schema_spec.md`**: 定義高階 TestCase 結構與 Assert/Export 語法。
- **`docs/design/03_grpc_unary_executor_spec.md`**: gRPC Unary 執行器，支援動態 Reflection，無需預先編譯 `.proto`，已改用 `endpoint` 直連。
- **`docs/design/04_websocket_executor_spec.md`**: WebSocket 執行器，支援內建背景 goroutine 與記憶體佇列，完美支援 `connect`、`send`、`await` (先進先出配對截斷) 與 `close`。
- **`docs/design/05_db_check_executor_spec.md`**: 內部資料庫驗證，支援原生 `postgres` 與 `mysql` 雙引擎，具備強大的動態指標映射 (Dynamic Row Mapping) 功能。
- **`docs/design/06_http_executor.md`**: HTTP 執行器，支援完整的 RESTful API 呼叫。
- **`docs/design/07_web_ui_spec.md`**: 旗艦級 Web UI，採用深色模式、毛玻璃特效與動態 JSON 高亮，並透過 `//go:embed` 無縫打包進執行檔中 (`internal/api/web/`)。
- **架構重構與 Fake Server 整合**: CLI 入口移至專案根目錄 `main.go`，並新增 `smoke_test.go` 與 `config/fake.yaml` 供自體端對端測試。

## 待實作 (未來的進階優化方向)

- **Run Store 的持久化**: 將目前的 In-Memory Store 升級為 SQLite 持久化儲存 (目前已有 `data/` 目錄與 CLI 參數支援，待實作底層邏輯)。
- **Include 執行器強化**: 支援防呆機制的「循環 include 偵測」。
- **全域 Config 管理**: 實作統一的設定檔機制，取代目前個別 Step 手動傳入 `dsn` 或 `endpoint` 的做法。

## 參考規格書

- `docs/design/` 下所有 Markdown 規格書均為最新且與程式碼 100% 同步的真實狀態。
