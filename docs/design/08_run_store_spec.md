# Run Store Spec

Run Store 負責保存每次測試執行的結果，供 Web UI 查詢歷史紀錄。

---

## 兩種實作

| 模式 | 說明 | 使用時機 |
| --- | --- | --- |
| Memory | in-memory，重啟後清空 | 快速開發、不需要歷史 |
| SQLite | 持久化到本地 `.db` 檔案 | 需要跨 session 保留執行紀錄 |

啟動時透過 `--db` flag 指定 SQLite 路徑，未指定則使用 Memory：

```bash
./app --db data/runs.db   # SQLite
./app                     # Memory（預設）
```

---

## Store 介面

```go
type Store interface {
    Save(run runner.RunResult)
    List() []runner.RunResult
}
```

---

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    test_case_id TEXT    NOT NULL,
    status       TEXT    NOT NULL,
    started_at   DATETIME NOT NULL,
    finished_at  DATETIME NOT NULL,
    elapsed_ms   INTEGER  NOT NULL,
    steps_json   TEXT     NOT NULL
);
```

`steps_json` 保存整個 `[]StepResult` 序列化的 JSON，查詢時反序列化回來。

---

## 行為

- `Save`：INSERT 一筆，`steps_json` 為 steps 的 JSON 字串
- `List`：SELECT 全部，依 `started_at DESC` 排序，反序列化 `steps_json` 回 `[]StepResult`

---

## 注意事項

- `data/` 目錄不進版控
- SQLite 檔案路徑由外部指定，store 本身不決定路徑
