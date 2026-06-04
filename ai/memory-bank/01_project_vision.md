# Project Vision

## 專案定位

- **名稱**：OctoAssert
- **是什麼**：一個本地 Web UI 自動化測試工具，支援多種 API 協議（gRPC、HTTP、WebSocket、DB）的 test case 管理、建構與執行。
- **為誰服務**：專為開發、測試與架構分析使用，非對外正式產品。不綁定特定 domain，任何後端服務皆可使用。
- **名稱由來**：Octo（八爪魚）象徵同時伸向多種協議；Assert 直接點明測試驗證的核心用途。
- **核心價值**：統一測試介面、資料驅動測試（Data-Driven Testing）、外部結果與內部狀態的雙層驗證，以及測試即文件（Documentation as Code）。

## 核心目標

- 取代散落的 Postman 與零碎腳本，用 Web UI 統一管理 test case。
- 落實「資料驅動測試（Data-Driven Testing）」：Go 程式負責提供 runner、executor、catalog 與 run store；測試步驟、交互說明與檢查方式由 JSON 描述。只有新增測試入口或 executor 類型時，才需要擴充 Go 程式碼。
- 以本地 JSON 描述測試流程，讓 test case 成為可執行的 API 規格與交互說明。
- 每次執行後，自動留下各協議回應、DB 檢查結果與耗時，作為除錯、比對與架構分析依據。
- 支援 Test Case Builder，讓使用者透過 Web UI 視覺化建構 test case，無需手寫 JSON。

## 支援的協議與 Executor

- **gRPC Unary**：透過 Server Reflection 動態解析服務與 method，支援 proxy 模式（x-server-id routing）。
- **HTTP Request**：標準 RESTful API 呼叫。
- **WebSocket**：connect / send / await / close 四種 step type，背景佇列機制。
- **DB Check**：postgres / mysql / sqlite，內部狀態白盒驗證。
- **Delay / Include / Group**：流程控制與步驟複用。
- **Fake gRPC / Fake HTTP Server**：本地假服務，隔離外部依賴。

## 驗證觀念

驗證分成兩種：

- **外部結果檢查（black-box check）**：確認 API 回應、WebSocket 推播等使用者可見的結果。
- **內部狀態檢查（white-box check）**：輔助確認服務內部副作用，例如 DB 狀態，不應取代外部結果檢查。

內部狀態檢查是除錯手段，不是正式使用者路徑。

## 文件驅動方向

Memory bank 只描述穩定的大方向。具體 test case schema、executor 規格、UI layout、runner 流程等細節，留到 `docs/design/` 規格書定義。
