# WebSocket Executor Spec

WebSocket executor 負責連線、送訊息、等待推播與關閉連線。內建背景 goroutine 與記憶體佇列，確保訊息不會遺失。

---

## websocket_connect

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

連線成功後，系統產生一個唯一的 `conn_id`（格式：`ws-{timestamp}`），寫入 ResponseSummary，透過 exports 取出供後續步驟使用。

**ResponseSummary**：
```json
{ "conn_id": "ws-1234567890" }
```

---

## websocket_send

```json
{
  "type": "websocket_send",
  "action": {
    "conn_id": "${ctx.ws_conn}",
    "payload": { "event": "Ping", "data": {} }
  }
}
```

**ResponseSummary**：
```json
{ "status": "sent" }
```

---

## websocket_await

背景佇列採「先進先出、配對即截斷」策略：掃描到符合 `match` 條件的訊息後，回傳該訊息並清除它及之前的所有舊訊息。

**ResponseSummary 就是配對到的完整訊息**，可直接對它加 exports 提取欄位。

```json
{
  "type": "websocket_await",
  "action": {
    "conn_id": "${ctx.ws_conn}",
    "match": {
      "path": "event_name",
      "equals": "RoundResult"
    },
    "timeout_ms": 5000
  },
  "exports": [
    { "path": "data.round_uuid", "as": "ctx.round_uuid" }
  ]
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `conn_id` | string | ✅ | 目標連線 ID |
| `match.path` | string | ✅ | JSONPath，用來比對訊息欄位 |
| `match.equals` | any | ✅ | 期望值 |
| `timeout_ms` | int | ❌ | 等待逾時，預設 5000ms |

逾時未配對到訊息時，step 標記為 failed。

---

## websocket_close

```json
{
  "type": "websocket_close",
  "action": {
    "conn_id": "${ctx.ws_conn}"
  }
}
```

關閉連線並停止背景 goroutine，從 pool 中移除該 conn_id。

**ResponseSummary**：
```json
{ "status": "closed" }
```
