# gRPC Unary Executor Spec

`grpc_unary` executor 負責執行一問一答的 gRPC API 測試。採用 `jhump/protoreflect` 動態引擎，透過 gRPC Server Reflection 解析服務，**不需要提前編譯 `.proto` 檔案**。

---

## Action Schema

```json
{
  "type": "grpc_unary",
  "action": {
    "endpoint": "localhost:50054",
    "service": "ClassicalBaccarat",
    "method": "ReviveRoom",
    "metadata": {
      "authorization": "Bearer ${ctx.token}"
    },
    "payload": {
      "room_serial": 1
    }
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `endpoint` | string | ✅ | gRPC server 位址，例如 `localhost:50054` |
| `service` | string | ✅ | 完整 service 名稱，需與 Server Reflection 回傳一致 |
| `method` | string | ✅ | 方法名稱 |
| `metadata` | object | ❌ | gRPC metadata（對應 HTTP header） |
| `payload` | object | ❌ | 請求 body，純 JSON，系統自動透過 Reflection 轉為 Protobuf |

---

## ResponseSummary 格式

成功時：

```json
{
  "grpc_code": "OK",
  "response": {}
}
```

失敗時：

```json
{
  "grpc_code": "NOT_FOUND",
  "grpc_desc": "room not found",
  "response": {}
}
```

| 欄位 | 說明 |
| --- | --- |
| `grpc_code` | gRPC status code 字串，例如 `OK`、`NOT_FOUND`、`UNAVAILABLE` |
| `grpc_desc` | gRPC error message，僅在非 OK 時出現 |
| `response` | Server 回傳的資料，Protobuf 自動轉 JSON |

---

## 斷言範例

```json
"asserts": [
  { "type": "json_path", "path": "grpc_code", "expect": "OK" }
]
```

錯誤情境：

```json
"asserts": [
  { "type": "json_path", "path": "grpc_code", "expect": "NOT_FOUND" },
  { "type": "json_path", "path": "grpc_desc", "expect": "room not found" }
]
```

---

## 注意事項

- gRPC server 必須啟用 **Server Reflection**，否則 service 無法被解析
- 目前非 OK 的 gRPC 回應一律標記為 step failed；若要驗證預期的 error，需先用 assert 捕捉 `grpc_code`，目前仍會被標記 failed（待改進）
