# Fake Server Spec

Fake server executor 讓 test case 在執行前啟動本地假服務，測試完畢後關閉。用途是讓測試不依賴外部真實服務，適合 CI 或本地開發驗證 executor 行為。

---

## fake_http_start

啟動本地 HTTP server，依 action 中的 routes 回傳設定好的 response。

```json
{
  "step_id": "start_http",
  "type": "fake_http_start",
  "action": {
    "port": 18080,
    "routes": [
      {
        "method": "GET",
        "path": "/health",
        "status": 200,
        "body": { "status": "ok" }
      },
      {
        "method": "POST",
        "path": "/api/login",
        "status": 200,
        "body": { "token": "fake-token-123" }
      }
    ]
  },
  "exports": [
    { "path": "url", "as": "ctx.fake_http_url" }
  ]
}
```

| 欄位 | 說明 |
| --- | --- |
| `port` | 監聽 port |
| `routes[].method` | HTTP method |
| `routes[].path` | URL path |
| `routes[].status` | HTTP status code |
| `routes[].body` | Response body（JSON object） |

**ResponseSummary**：`{"url": "http://localhost:18080"}`

未找到 route 時回傳 `404`。

---

## fake_http_stop

```json
{
  "step_id": "stop_http",
  "type": "fake_http_stop",
  "action": {
    "url": "${ctx.fake_http_url}"
  }
}
```

---

## fake_grpc_start

啟動本地 gRPC server，載入指定 `.proto` 檔案，支援 Server Reflection。依 `responses` 設定回傳各 method 的 JSON response。

```json
{
  "step_id": "start_grpc",
  "type": "fake_grpc_start",
  "action": {
    "port": 19090,
    "proto_files": ["proto/fake/service.proto"],
    "responses": {
      "FakeService/GetStatus": { "status": "ok", "code": 0 },
      "FakeService/Echo":      { "message": "pong" }
    }
  },
  "exports": [
    { "path": "addr", "as": "ctx.fake_grpc_addr" }
  ]
}
```

| 欄位 | 說明 |
| --- | --- |
| `port` | gRPC server port |
| `proto_files` | 相對執行目錄的 .proto 路徑列表 |
| `responses` | `"ServiceName/MethodName"` → JSON response body |

**ResponseSummary**：`{"addr": "localhost:19090"}`

未設定 response 的 method 回傳空 `{}`。

---

## fake_grpc_stop

```json
{
  "step_id": "stop_grpc",
  "type": "fake_grpc_stop",
  "action": {
    "addr": "${ctx.fake_grpc_addr}"
  }
}
```

---

## 典型使用模式

```json
{
  "id": "smoke_test",
  "steps": [
    { "step_id": "start_http",  "type": "fake_http_start",  "action": { ... }, "exports": [...] },
    { "step_id": "start_grpc",  "type": "fake_grpc_start",  "action": { ... }, "exports": [...] },
    { "step_id": "call_http",   "type": "http_request",     "action": { "url": "${ctx.fake_http_url}/health" } },
    { "step_id": "call_grpc",   "type": "grpc_unary",       "action": { "endpoint": "${ctx.fake_grpc_addr}", ... } },
    { "step_id": "stop_http",   "type": "fake_http_stop",   "action": { "url": "${ctx.fake_http_url}" } },
    { "step_id": "stop_grpc",   "type": "fake_grpc_stop",   "action": { "addr": "${ctx.fake_grpc_addr}" } }
  ]
}
```

---

## Proto 檔案慣例

Fake server 使用的 .proto 放在 `proto/fake/`，不進 `proto/` 主目錄。
