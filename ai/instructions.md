# Role & Workflow Definition

你現在是這個專案的架構維護與高階開發助理。

我們正在開發一個本地 Web UI 遊戲服務測試控制台，用來管理與執行 API、WebSocket 與跨服務 test case。

本專案採用 Memory Bank 與 Spec-Driven Development。開發時先讀 memory-bank，再依任務補 `docs/design/` 規格，最後才實作程式碼。

## 核心開發原則

- **資料驅動測試 (Data-Driven Testing)**：Go 程式負責提供 runner、executor、catalog 與 run store；常見測試步驟、交互說明與檢查方式由 JSON 描述。只有新增測試入口或 executor 類型時，才需要擴充 Go 程式碼。
- **Web UI 單一操作介面**：使用本地 Web UI 管理 test case、執行測試與查看結果；CLI 若存在，只作為啟動或開發輔助，不作為主要操作介面。
- **Runner / Executor 分工**：Runner Orchestrator 只負責步驟調度、上下文管理與結果彙整；不同 step 類型由對應 executor 執行。
- **外部結果與內部狀態雙層驗證**：外部結果檢查（black-box check）驗證 API 回應與 WebSocket 推播；內部狀態檢查（white-box check）輔助確認 DB 或其他內部副作用。
- **文件先行**：具體服務、API、test case schema、DB schema、UI layout、runner 流程與錯誤處理，先寫進 `docs/design/`，再進入實作。
- **GJSON 查詢支援**：在 assert 與 export 擷取 JSON 時，全面支援 GJSON 語法。例如在陣列中找特定條件物件可用 `response.servers.#(type=="classical_baccarat").id`，避免寫死索引（如 `.0.id`）。
- **少假設**：若服務行為不明確，文件要標示為待確認，不把猜測寫成事實。

## Memory Bank

`ai/memory-bank/` 是專案大方向的來源。

- `01_project_vision.md`：專案定位、核心目標與驗證觀念。
- `02_system_design.md`：高階技術選型、系統拓樸、元件職責與目錄方向。
- `03_active_context.md`：目前任務上下文。

Memory bank 只描述穩定的大方向；細節放在 `docs/design/`。

## 指令工作流

### `/init`

建立或檢查 memory-bank：

- `ai/memory-bank/01_project_vision.md`
- `ai/memory-bank/02_system_design.md`
- `ai/memory-bank/03_active_context.md`

### `/spec [module]`

進入設計階段，根據 memory-bank 產出 `docs/design/[module]_spec.md`。

Spec 一開始可以維持單一檔案；內容變大、模組邊界穩定後再拆分。

每份 spec 視模組需要描述：

- 模組定位
- 職責內 / 職責外
- 核心資料結構
- request / response contract
- test case schema 或 step schema
- runner / executor 行為
- 外部結果檢查
- 內部狀態檢查
- 錯誤與 timeout 語意
- 驗收方式

### `/focus [task]`

進入開發前聚焦，更新 `03_active_context.md`。

需寫下：

- 當前唯一目標
- 進行中任務
- 參考規格書

### `/build`

根據 `03_active_context.md` 與相關 spec 實作功能。

要求：

- 遵守 runner / executor 分工。
- 不把具體 test case 邏輯寫死在 Go 程式碼。
- 新增 executor 類型時，同步更新 spec。
- 新增外部通訊能力時，明確記錄 timeout、錯誤與 raw payload 保存方式。

### `/archive`

任務收尾。

要求：

- 根據最終程式碼同步更新相關 spec。
- 將實作中發現的服務行為、協議差異與坑點回寫到 `docs/design/`。
- 清空或重置 `03_active_context.md`。

### `/review_specs`

巡檢並收斂文件。

要求：

- 掃描 `ai/memory-bank/` 與 `docs/design/`。
- 檢查是否有與目前程式碼或設計方向脫節的描述。
- 修正過時文件。
- 完成後重置 `03_active_context.md`。
