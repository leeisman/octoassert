# Include Executor Spec

## 模組定位

`include` executor 負責在測試流程中引入外部資源，目前支援兩種用途：

1. **引入 JSON test case**：把另一個 test case 的步驟嵌入當前流程，共用同一個 execution context
2. **引入 YAML config**：載入環境設定（endpoint、port、DSN 等），透過 `exports` 注入 context，讓 test case 與環境解耦

---

## 職責內 / 職責外

**職責內**：
- 讀取並執行另一個 JSON test case，共享 execution context
- 讀取 YAML config 檔，把指定欄位注入 context

**職責外**：
- 不負責 test case 的驗證邏輯
- 不支援遞迴 include（include 的子 test case 中再 include）目前未做循環偵測，使用時需自行避免

---

## Step Schema

### 引入 JSON Test Case

```json
{
  "step_id": "1",
  "type": "include",
  "description": "執行建房與啟動的共用流程",
  "action": {
    "file_path": "testcases/setup/create_and_revive_room.json"
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `file_path` | string | ✅ | 相對於執行目錄的 JSON test case 路徑 |

**Context 行為**：sub test case 與 parent 共用同一個 `ExecutionContext`。sub test case 中 export 的變數，parent 後續步驟可以直接使用。

---

### 引入 YAML Config

```json
{
  "step_id": "1",
  "type": "include",
  "description": "載入本地環境設定",
  "action": {
    "file_path": "config/local.yaml"
  },
  "exports": [
    { "path": "lobby.ws_url",      "as": "ctx.ws_url" },
    { "path": "lobby.grpc",        "as": "ctx.lobby_grpc" },
    { "path": "baccarat.grpc",     "as": "ctx.baccarat_grpc" },
    { "path": "db.dsn",            "as": "ctx.db_dsn" }
  ]
}
```

**YAML config 範例**（`config/local.yaml`）：

```yaml
lobby:
  ws_url: "ws://localhost:8080/ws"
  grpc: "localhost:50055"
baccarat:
  grpc: "localhost:50054"
db:
  dsn: "postgres://user:pass@localhost:5432/gamedb?sslmode=disable"
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `file_path` | string | ✅ | 相對於執行目錄的 YAML config 路徑 |
| `exports` | array | ❌ | 要注入 context 的欄位，`path` 為 YAML key path，`as` 為 context 變數名稱 |

**檔案類型判斷**：executor 依副檔名決定行為，`.yaml` / `.yml` → config 模式，`.json` → test case 模式。

---

## 典型使用模式

每個需要連線特定服務的 test case，在第一步 include config，後續步驟用 `${ctx.xxx}` 取值，不 hardcode endpoint：

```json
{
  "steps": [
    {
      "step_id": "1",
      "type": "include",
      "description": "Load local environment config",
      "action": { "file_path": "config/local.yaml" },
      "exports": [
        { "path": "lobby.ws_url",  "as": "ctx.ws_url" },
        { "path": "baccarat.grpc", "as": "ctx.baccarat_grpc" }
      ]
    },
    {
      "step_id": "2",
      "type": "websocket",
      "description": "Connect lobby websocket and wait for ready event",
      "action": {
        "url": "${ctx.ws_url}?token=${ctx.token}",
        "operations": [
          {
            "type": "await",
            "match": { "path": "event_name", "equals": "Ready" },
            "timeout_ms": 5000
          }
        ]
      }
    },
    {
      "step_id": "3",
      "type": "grpc_unary",
      "action": {
        "endpoint": "${ctx.baccarat_grpc}",
        "service": "ClassicalBaccarat",
        "method": "ReviveRoom",
        "payload": { "room_serial": "${ctx.room_serial}" }
      }
    }
  ]
}
```

---

## 錯誤語意

| 情境 | 行為 |
| --- | --- |
| 檔案不存在 | step 失敗，錯誤訊息帶 file path |
| JSON 格式錯誤 | step 失敗，錯誤訊息帶 parse error |
| YAML 格式錯誤 | step 失敗，錯誤訊息帶 parse error |
| sub test case 某步驟失敗 | include step 標記為失敗，parent runner 停止 |
| export path 不存在 | 該 export 跳過，不影響其他 export，不導致 step 失敗 |

---

## 實作狀態

| 功能 | 狀態 |
| --- | --- |
| 引入 JSON test case（共享 context） | ✅ 已實作 |
| 引入 YAML config + exports | ⬜ 待實作 |
| 循環 include 偵測 | ⬜ 待實作 |
