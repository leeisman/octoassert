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

## 2. 共通機制：Asserts & Exports

任何 Step 都可以附加斷言與變數提取（基於 JSONPath）：

```json
{
  "step_id": "example_step",
  "type": "...",
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

- `asserts`：斷言失敗則該 step 標記為 failed，runner 停止
- `exports`：從 `ResponseSummary` 提取值存入 context，供後續步驟用 `${ctx.xxx}` 引用

---

## 3. Group 檔案格式

Group 是純粹的 step 集合，不是完整 test case，放在 `testcases/groups/` 目錄，不會被 catalog 掃描為可執行的 test case。

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

## 4. Step Types 字典

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

### websocket_connect
```json
{
  "type": "websocket_connect",
  "action": {
    "url": "ws://localhost:8080/ws?token=${ctx.token}",
    "headers": {}
  },
  "exports": [
    { "path": "conn_id", "as": "ctx.ws_conn" }
  ]
}
```

連線成功後 `conn_id` 自動產生，透過 `exports` 取出供後續步驟使用。

### websocket_send
```json
{
  "type": "websocket_send",
  "action": {
    "conn_id": "${ctx.ws_conn}",
    "payload": { "event": "Ping", "data": {} }
  }
}
```

### websocket_await
```json
{
  "type": "websocket_await",
  "action": {
    "conn_id": "${ctx.ws_conn}",
    "match": { "path": "event_name", "equals": "RoundResult" },
    "timeout_ms": 5000
  }
}
```

### websocket_close
```json
{
  "type": "websocket_close",
  "action": { "conn_id": "${ctx.ws_conn}" }
}
```

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
  "action": { "file": "testcases/groups/login.json" }
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
