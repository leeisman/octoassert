# Catalog Spec：Test Case Schema 字典

Catalog 負責掃描 `testcases/` 目錄下的 JSON 檔案，解析並驗證每個 test case 的格式，提供給 Runner 執行。

分類（Category）由**目錄結構**決定，不依賴 JSON 欄位。例如 `testcases/baccarat/place_bet.json` 的 category 為 `baccarat`。

---

## 1. Test Case 骨架

```json
{
  "id": "test_001",
  "name": "Lobby 登入與下注流程",
  "description": "測試玩家登入、取得 Token、連線 WS、打 gRPC 以及寫入 DB 的完整流程",
  "config": { "timeout_ms": 10000 },
  "steps": []
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 唯一識別碼，catalog 以此查詢 |
| `name` | string | ✅ | 顯示名稱 |
| `description` | string | ❌ | 流程說明 |
| `config.timeout_ms` | int | ❌ | 整個 test case 的執行 timeout（毫秒），預設 30000（30 秒） |
| `steps` | array | ✅ | 測試步驟，至少一個 |

---

## 2. 共通機制：Step 結構與 Asserts / Exports

每個測試步驟 (Step) 都具備以下共通結構：

```json
{
  "step_id": "1",
  "type": "http_request",
  "description": "呼叫登入 API",
  "action": {},
  "asserts": [
    {
      "type": "json_path",
      "path": "data.status",
      "expect": "OK"
    }
  ],
  "exports": [
    {
      "path": "data.token",
      "as": "ctx.token"
    }
  ]
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `step_id` | string | ✅ | 步驟唯一識別碼 (早期版本為 `name`，現已統一為 `step_id`) |
| `type` | string | ✅ | 執行器類型，例如 `http_request`, `grpc_unary` 等 |
| `description` | string | ❌ | 步驟說明文字 |
| `action` | object | ✅ | 依據 `type` 決定欄位內容 (參見下方字典) |
| `asserts` | array  | ❌ | 斷言規則，失敗則該 step 標記為 failed，runner 停止 |
| `exports` | array  | ❌ | 從 `ResponseSummary` 提取值存入 context，供後續步驟用 `${ctx.xxx}` 引用 |

---

## 3. Context Placeholder

`exports` 寫入 context，後續 action 可以用 `${ctx.xxx}` 引用。

```json
{
  "exports": [
    { "path": "Payload.E.0.S", "as": "ctx.roomid" }
  ]
}
```

```json
{
  "payload": {
    "Type": "subscribe",
    "Room": "${ctx.roomid}"
  }
}
```

當 placeholder 佔據整個 JSON value 時，runner 會保留 context 原始型別。若 `ctx.roomid` 是數字，送出時就是數字，不會變成字串。

Builder JSON editor 允許便利寫法：

```json
{
  "Room": ${ctx.roomid}
}
```

UI 會在儲存或執行前正規化為合法 JSON placeholder。

---

## 4. Group 檔案格式

Group 是純粹的 step 集合，不是完整 test case，通常放在任一 catalog 底下的 `groups/` 目錄，例如 `testcases/baccarat/groups/login.json`。Catalog 不應把 group 當成普通可執行 test case。

```json
{
  "name": "login",
  "description": "登入並取得 token",
  "steps": []
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `name` | string | ✅ | group 名稱，用於識別與除錯 |
| `description` | string | ❌ | 說明 |
| `steps` | array | ✅ | 同 test case 的 steps 格式 |

---

## 5. Step Types 字典

### delay
```json
{
  "type": "delay",
  "action": { "duration_ms": 2000 }
}
```

### http_request
```json
{
  "type": "http_request",
  "action": {
    "method": "POST",
    "url": "http://localhost:8080/api/v1/login",
    "headers": { "Content-Type": "application/json" },
    "payload": { "user": "frankie", "pass": "1234" }
  }
}
```

### grpc_unary
```json
{
  "type": "grpc_unary",
  "action": {
    "endpoint": "localhost:50054",
    "service": "distribute.DistributeLobby",
    "method": "FetchOperateGameList",
    "metadata": { "authorization": "Bearer ${ctx.token}" },
    "payload": { "room_serial": [1, 2, 3] }
  }
}
```

### websocket
```json
{
  "type": "websocket",
  "action": {
    "url": "ws://localhost:8080/ws?token=${ctx.token}",
    "headers": {},
    "operations": [
      {
        "type": "send",
        "payload": {
          "Type": "page",
          "Payload": {}
        }
      },
      {
        "type": "await",
        "match": { "path": "Type", "equals": "presence.page" },
        "timeout_ms": 5000,
        "exports": [
          { "path": "Payload.E.0.S", "as": "ctx.roomid" }
        ]
      },
      {
        "id": "subscribe",
        "type": "send",
        "payload": {
          "Type": "subscribe",
          "Room": "${ctx.roomid}"
        }
      },
      {
        "id": "optional-debug-send",
        "type": "send",
        "disabled": true,
        "payload": {
          "Type": "debug",
          "Room": "${ctx.roomid}"
        }
      },
      {
        "type": "collect",
        "timeout_ms": 5000
      }
    ]
  }
}
```

`websocket` 是一體化步驟：步驟開始時建立連線，依序執行 `operations`，結束時自動關閉連線。支援 `send`、`await`、`collect`。

- `disabled: true` 會跳過該 operation。
- `send` 會在送出前注入 context，並把 `Type` / `type` 排為第一個 JSON 欄位。
- `await` 可以在同一步驟中 export，後續 `send` 可立即使用該值。
- Runtime operation log 會寫入 `raw_payload.operation_logs`，供 UI 檢查實際 payload、時間與 collected messages。

### db_check
```json
{
  "type": "db_check",
  "action": {
    "driver": "postgres",
    "dsn": "postgres://user:pass@localhost:5432/mydb?sslmode=disable",
    "sql": "SELECT id, status FROM users WHERE id = $1",
    "args": ["${ctx.user_id}"]
  }
}
```

### group

```json
{
  "type": "group",
  "action": { "file": "testcases/baccarat/groups/login.json" }
}
```

載入 group 檔案並展開其 steps，共享 execution context。詳見 `10_group_executor_spec.md`。

### include
```json
{
  "type": "include",
  "action": { "file_path": "config/local.yaml" },
  "exports": [
    { "path": "lobby.ws_url", "as": "ctx.ws_url" }
  ]
}
```

詳見 `08_include_executor_spec.md`。
