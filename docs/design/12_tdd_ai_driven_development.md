# 12. AI 驅動的合約式開發流程

本文件描述 OctoAssert 未來在 AI 開發流程中的定位：讓 OctoAssert 成為「人類需求」、「AI 生成代碼」與「可執行 API 驗證」之間的橋樑。

這個方向不是單純的「先寫測試」。真正的核心是：人類先和 AI 把功能需求聊清楚，將討論結果整理成穩定的交互規格，再讓 AI 依照這份規格生成實作，最後用 OctoAssert 透過真實協議驗證實作是否符合規格。

## 產品想法

OctoAssert 應該支援一條 AI 原生的開發閉環：

```text
人類 + AI 討論功能需求
  -> 產生交互規格 Markdown
  -> 產生 OctoAssert 可執行 Test Case JSON
  -> AI 依照規格實作專案代碼
  -> OctoAssert 透過真實協議驗證
  -> 失敗日誌成為 AI 修復上下文
```

在這個模型裡，OctoAssert 同時扮演兩個角色：

- 可執行合約系統
- 交互證據產生器

## 為什麼需要這個流程

使用 AI 開發後端功能時，最困難的通常不是「產生代碼」。真正困難的是讓需求、實作與實際行為保持一致。

常見問題：

- AI 實作出的 API shape 和一開始討論的不一樣。
- Payload 欄位名稱在前端、後端、測試之間逐漸漂移。
- WebSocket 交互只用口語描述，之後很難重現。
- Debug log 太吵、沒有結構，難以回餵給 AI。
- 需求只留在聊天紀錄裡，無法被重跑、比對或驗證。

OctoAssert 可以把預期交互轉成穩定資產：

- 人類和 AI 都能閱讀的 Markdown。
- 機器可以執行的 JSON Test Case。
- 可以說明實際發生什麼事的 Run Log 與 Operation Log。

## 核心產物

### 1. 交互規格 Markdown

交互規格是一份人類可讀的 Markdown 文件，可以由需求討論、AI 對話或既有 Test Case 生成。

它應該描述：

- 功能目標
- 參與角色與服務
- API endpoint
- gRPC service / method
- WebSocket 連線 URL
- WebSocket operations 順序
- request payload
- expected response
- assertions
- context variables
- DB side effects
- error cases
- open questions
- acceptance criteria

建議位置：

```text
docs/interactions/<feature_name>.md
```

範例片段：

````markdown
# 交互規格：玩家房間訂閱

## 目標

玩家登入後，連線 WebSocket endpoint，收到 page data，匯出 room id，對該 room 發送 subscribe，並收集後續推播訊息。

## 流程

1. 引用 login group，匯出 `ctx.ticket`。
2. 使用 `ticket=${ctx.ticket}` 連線 WebSocket。
3. 等待 `presence.page`。
4. 從 `Payload.E.0.S` 匯出 `ctx.roomid`。
5. 發送 subscribe payload。
6. 收集 10 秒推播訊息。

## Send Payload

```json
{
  "Type": "subscribe",
  "Room": "${ctx.roomid}"
}
```

## 驗收條件

- `ctx.roomid` 必須是 number。
- 實際送出的 WebSocket payload 中，`Room` 必須是 number，不是 string。
- Collected messages 顯示時必須保留 raw field order，方便除錯。
````

### 2. 可執行合約 JSON

這是位於 `testcases/` 底下的 OctoAssert Test Case。

它是自動化驗證的 source of truth。

範例：

```text
testcases/baccarat/player/player_websocket_operations.json
```

這份 JSON 必須不依賴聊天紀錄，也能獨立被執行與理解。

### 3. AI 實作 Prompt

這是一段給 coding AI 的實作提示，可以由系統生成，也可以由人類整理。

它應該引用：

- 交互規格 Markdown
- OctoAssert JSON Test Case
- 相關 proto files 或 API contract
- 實作限制
- 預期驗證方式

範例：

```markdown
請依照以下文件實作後端行為：

- docs/interactions/player_room_subscribe.md
- testcases/baccarat/player/player_websocket_operations.json

除非先更新規格，否則不要修改 contract。
實作完成後，啟動目標服務並用 OctoAssert 驗證。
所有 steps 必須通過。
```

### 4. 驗證證據

執行後，OctoAssert 應該提供可以直接貼回給 AI 的證據。

證據應包含：

- run id
- failed step
- step request
- step response
- operation log
- raw sent payload
- raw collected messages
- 依照 run id 過濾後的後端 structured logs

這能讓 AI 根據具體事實修復實作，而不是靠模糊的錯誤描述猜測。

## 工作流程

### 階段一：規格對話

人類和 AI 先討論功能。

預期產物：

```text
docs/interactions/<feature>.md
```

AI 應該持續追問，直到交互行為可以被測試。

需要釐清的問題包括：

- 流程由什麼事件開始？
- 涉及哪些協議？
- 哪些值需要 export 成 context？
- 應該驗證哪些結果？
- 是否需要檢查 DB 狀態？
- 合法的錯誤情境有哪些？

### 階段二：合約生成

根據交互規格，生成或更新 OctoAssert Test Case JSON。

預期產物：

```text
testcases/<catalog>/<feature>.json
```

產生出的 test case 應包含：

- 自動遞增的數字字串 `step_id`
- 清楚的 `description`
- protocol actions
- assertions
- exports
- WebSocket operations
- 必要時加入 DB checks
- 只有在刻意作為 optional/debug operation 時才使用 disabled operations

### 階段三：實作

將交互規格與 OctoAssert JSON 交給 coding AI。

實作 AI 必須遵守：

- 將交互規格視為人類可讀的 contract。
- 將 OctoAssert JSON 視為可執行 contract。
- 不要為了讓實作變簡單，偷偷改 API shape。
- 如果 contract 不可能實作或語意不明，必須先更新規格。

### 階段四：驗證

使用 OctoAssert 執行實作。

預期輸出：

- pass / fail result
- run id
- step logs
- operation logs

失敗時需要收集：

- failed step response
- operation log tab content
- 依照 `run_id` 過濾的 backend structured logs

### 階段五：修復閉環

將驗證證據回餵給 AI。

Prompt 範例：

```markdown
目前實作不符合 OctoAssert contract。

規格：
- docs/interactions/<feature>.md

可執行合約：
- testcases/<catalog>/<feature>.json

失敗證據：
- Run ID: <run_id>
- Failed step: <step_id>
- Error: <error>
- Operation Log: <copy relevant log>

請修復實作。除非你能說明規格本身錯誤，否則不要修改 contract。
```

重複這個流程，直到 OctoAssert 全部通過。

## OctoAssert 需要支援的能力

### Markdown 匯出

未來 UI 應該支援：

- 將選取的 test case 匯出為交互規格 Markdown。
- 將失敗 run 匯出為 AI 修復 Markdown。
- 將 operation log 複製成 Markdown。

建議按鈕：

- `匯出交互規格`
- `複製 AI 修復上下文`
- `複製 Operation Log`

### Test Case Builder 支援

Builder 應持續支援：

- context autocomplete
- typed context injection
- WebSocket operation disable
- operation log tabs
- raw payload / raw message display
- JSON tree viewer

這些能力很重要，因為它們能讓人類和 AI 確認精確的協議交互。

### Run ID 與結構化日誌

`docs/design/11_xray_distributed_tracing_logging_plan.md` 是這個流程的重要基礎。

每次驗證都應該產生：

- 前端可見的 `run_id`
- 可用 `run_id` 搜尋的 backend structured logs
- step-level result JSON
- 適用時提供 WebSocket operation logs

### 規格存放位置

建議目錄：

```text
docs/
  interactions/
    baccarat/
      player_room_subscribe.md
  design/
    12_tdd_ai_driven_development.md
testcases/
  baccarat/
    player/
      player_websocket_operations.json
```

`docs/interactions/` 放功能級交互規格。

`docs/design/` 放 OctoAssert 系統設計。

`testcases/` 放可執行合約。

## 交互規格模板

````markdown
# 交互規格：<功能名稱>

## 目標

<使用者或系統應該具備什麼行為？>

## 角色 / 服務

- Client:
- Backend:
- Database:
- External services:

## 前置條件

- <必要設定、認證、資料、fake servers 等>

## 流程

1. <步驟>
2. <步驟>
3. <步驟>

## Context 變數

| 變數 | 來源 | 型別 | 說明 |
| --- | --- | --- | --- |
| `ctx.ticket` | login response | string | WebSocket ticket |
| `ctx.roomid` | presence page payload | number | Room id |

## HTTP 交互

```http
POST /api/login
```

## gRPC 交互

| Endpoint | Service | Method | Metadata | Payload |
| --- | --- | --- | --- | --- |
| 127.0.0.1:50055 | cbm.ClassicalBaccarat | CreateRoom | x-server-id | `{}` |

## WebSocket 交互

### Connect

```text
ws://127.0.0.1:8080/api/v1/external/connect?ticket=${ctx.ticket}
```

### Operations

| ID | 類型 | 說明 | 預期 |
| --- | --- | --- | --- |
| 1 | await | Wait page | `Type == presence.page` |
| 2 | send | Subscribe | `Room` is numeric |
| 3 | collect | Collect pushes | one or more messages |

## DB Side Effects

```sql
SELECT ...
```

## Assertions

- <預期 API response>
- <預期 pushed message>
- <預期 DB state>

## Open Questions

- <任何不明確之處>

## OctoAssert Test Case

```text
testcases/<catalog>/<file>.json
```

## 給 AI 的實作注意事項

- 不要修改 request / response 欄位名稱。
- 數字 context value 必須保留 number 型別。
- 如果規格與目前代碼衝突，先停下來確認，不要直接改 contract。
````

## 非目標

- OctoAssert 不應變成通用 project generator。
- 第一版流程不要求 OctoAssert 直接呼叫 LLM。
- OctoAssert 不取代 source-level unit tests。
- 交互規格不取代產品需求文件；它描述的是可執行的協議行為。

## 成功標準

這個流程成功的標準：

- 一段功能討論可以產出交互規格 Markdown。
- 交互規格可以產出 OctoAssert JSON test case。
- Coding AI 可以依照這些 artifacts 實作功能。
- OctoAssert 可以透過真實協議驗證實作。
- 驗證失敗時，OctoAssert 能產生足夠證據，讓 AI 可以穩定修復代碼。
