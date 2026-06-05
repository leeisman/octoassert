# Web UI Spec

Web UI 是唯一主要操作介面，負責瀏覽 test case、執行測試與觀察結果。

---

## Layout

第一版已進化為旗艦級介面，採用深色模式（Dark Mode）、毛玻璃特效（Glassmorphism）與極簡設計：

1. **左側 Catalog Tree (Catalog Explorer)**
   - 樹狀顯示所有 Test Cases (`testcases/*`)，支援多層級資料夾。
   - 支援快速點擊展開/收合。
   - 右鍵選單支援 Run, Edit (進入 Builder), Duplicate, Delete, Select 等操作。
   - 頂部支援搜尋過濾。

2. **中間/右側 Test Case Builder & Runner Orchestrator**
   - **Test Case 資訊**: 顯示 ID, Name, Description, 設定 Timeout。
   - **Step 編輯/預覽區域**:
     - **左右分欄佈局 (Side-by-side Layout)**:
       - 左側：**Step Data** (參數、設定、Asserts、Exports)，可點擊收合按鈕 (Horizontal Collapse) 變為極窄側邊欄。
       - 右側：**Step Response** (執行結果的 JSON)，最高可達 `600px` 顯示超大 JSON，當左側收合時，右側自動展開佔據接近 100% 寬度。
   - 視覺反饋明確：失敗標紅、成功標綠、載入中動畫。

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
GET    /api/testcases          列出所有 test case 摘要
GET    /api/testcases/{id}     取得指定 test case 完整內容
POST   /api/testcases          建立或覆寫 test case
DELETE /api/testcases/{id}     刪除 test case
POST   /api/testcases/{id}/duplicate 複製 test case
POST   /api/run                執行指定 test case（body: {"id": "test_001"}）
```

執行 timeout 以 test case 的 `config.timeout_ms` 為準，未設定時預設 30 秒。

---

## 設計原則

- 前端只負責呈現與觸發，不執行任何測試邏輯
- Runner / executor 行為由後端負責
- test case 分類以資料夾為主，不依賴 UI 手動配置
