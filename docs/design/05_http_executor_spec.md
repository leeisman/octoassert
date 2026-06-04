# HTTP Executor Spec

`http_request` executor 負責執行 HTTP API 測試，適合 REST、HTTP gateway 或 health check 等一問一答的場景。

---

## Action Schema

```json
{
  "type": "http_request",
  "action": {
    "method": "POST",
    "url": "http://localhost:8080/api/v1/login",
    "headers": {
      "Content-Type": "application/json"
    },
    "payload": {
      "user": "frankie",
      "pass": "1234"
    }
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `method` | string | ✅ | HTTP method，例如 `GET`、`POST` |
| `url` | string | ✅ | 請求 URL，支援 `${ctx.xxx}` 注入 |
| `headers` | object | ❌ | Request headers |
| `payload` | object | ❌ | Request body，序列化為 JSON 送出 |

Timeout 固定為 10 秒。

---

## ResponseSummary 格式

```json
{
  "status_code": 200,
  "body": {}
}
```

| 欄位 | 說明 |
| --- | --- |
| `status_code` | HTTP status code |
| `body` | Response body，raw JSON |

---

## 斷言範例

```json
"asserts": [
  { "type": "json_path", "path": "status_code", "expect": 200 },
  { "type": "json_path", "path": "body.success", "expect": true }
]
```

---

## 注意事項

- `http_request` 屬於外部結果檢查（black-box check）
- 若需確認資料是否寫入 DB，應另外搭配 `db_check`
- per-step timeout 與 response headers 為待實作功能
