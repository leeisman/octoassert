# Web UI Spec

Web UI 是唯一主要操作介面，負責瀏覽 test case、執行測試與觀察結果。

---

## Layout

第一版採左右分欄：

```text
Test Case Tree      Response Console
  folders             Run Summary
  test cases          Step Results
                      Raw Response
```

---

## Test Case Tree

由 `testcases/` 目錄結構推導，不依賴 JSON 欄位。

```text
testcases/
  baccarat/
    place_bet.json
  queryserver/
    fetch_rooms.json
```

UI 呈現：

```text
baccarat
  Place Bet
queryserver
  Fetch Rooms
```

---

## Response Console

每次執行後顯示：

| 欄位 | 說明 |
| --- | --- |
| run status | passed / failed |
| test case id | 執行的 test case |
| elapsed time | 總耗時 |
| step list | 每個 step 的狀態、type、耗時、ResponseSummary、error |

---

## API Contract

```
GET  /api/testcases          列出所有 test case 摘要
GET  /api/testcases/{id}     取得指定 test case 完整內容
POST /api/run                執行指定 test case（body: {"id": "test_001"}）
GET  /api/runs               列出執行紀錄
```

執行 timeout 以 test case 的 `config.timeout_ms` 為準，未設定時預設 30 秒。

---

## 設計原則

- 前端只負責呈現與觸發，不執行任何測試邏輯
- Runner / executor 行為由後端負責
- test case 分類以資料夾為主，不依賴 UI 手動配置
