# gRPC Unary Executor Spec

`grpc_unary` executor 負責執行一問一答的 gRPC API 測試。採用 `jhump/protoreflect` 動態引擎，可透過 gRPC Server Reflection 或指定 `.proto` files 解析服務與 method。

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
    "proto_files": [
      "../distributedqueryserver/proto/ClassicalBaccaratManagement.proto"
    ],
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
| `proto_files` | array | ❌ | 額外 `.proto` 路徑；建議使用相對路徑以便跨機器執行 |
| `payload` | object | ❌ | 請求 body，純 JSON，系統自動透過 Reflection 轉為 Protobuf |

## Proxy Mode

當測試透過 queryserver/proxy 類型服務轉發時，`service` 與 `method` 可依 proxy contract 自訂，不一定需要等於最終後端服務的 reflection 名稱。

Proxy routing 所需 metadata 應由 test case 設定：

```json
{
  "type": "grpc_unary",
  "action": {
    "endpoint": "127.0.0.1:50055",
    "service": "cbm.ClassicalBaccarat",
    "method": "CreateRoom",
    "metadata": {
      "x-server-id": "${ctx.server_id}"
    },
    "payload": {
      "roomName": "octoassert-proxy-room"
    }
  }
}
```

Executor 不應寫死 `x-server-id` 或任何 proxy metadata key。

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

- gRPC server 若未啟用 **Server Reflection**，必須透過 `proto_files` 提供可解析的 `.proto`
- `proto_files` 優先使用相對路徑，不建議寫死開發機絕對路徑
- 目前非 OK 的 gRPC 回應一律標記為 step failed；若要驗證預期的 error，需先用 assert 捕捉 `grpc_code`，目前仍會被標記 failed（待改進）
