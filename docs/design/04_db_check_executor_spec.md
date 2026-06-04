# DB Check Executor Spec

`db_check` executor 負責內部狀態檢查（white-box check），用來驗證資料庫中的資料是否符合預期。查詢結果動態轉換為 JSON，可直接用 JSONPath 斷言。

---

## Action Schema

```json
{
  "type": "db_check",
  "action": {
    "driver": "postgres",
    "dsn": "${ctx.db_dsn}",
    "sql": "SELECT id, status FROM baccarat_room WHERE serial = $1",
    "args": ["${ctx.room_serial}"]
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `driver` | string | ❌ | 資料庫驅動，支援 `postgres`、`mysql`，預設 `postgres` |
| `dsn` | string | ✅ | 資料庫連線字串，建議從 include config 注入（`${ctx.db_dsn}`） |
| `sql` | string | ✅ | 原生 SQL，Postgres 用 `$1`、MySQL 用 `?` 帶入參數 |
| `args` | array | ❌ | 查詢參數，支援 `${ctx.xxx}` 注入 |

---

## ResponseSummary 格式

```json
{
  "row_count": 1,
  "rows": [
    {
      "serial": 1,
      "status": "active"
    }
  ]
}
```

> `row_count` 為 SELECT 回傳的列數，不是 SQL rows affected。

---

## 斷言範例

```json
"asserts": [
  { "type": "json_path", "path": "row_count", "expect": 1 },
  { "type": "json_path", "path": "rows.0.status", "expect": "active" }
]
```

---

## 注意事項

- `db_check` 是 white-box check，用來輔助驗證副作用，不應取代外部結果檢查（black-box check）
- DSN 不建議 hardcode 在 test case，應透過 `07_include_executor_spec.md` 的 config 模式注入
