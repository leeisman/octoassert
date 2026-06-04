# Group Executor Spec

## 模組定位

`group` executor 負責載入外部 group 檔案，將其 steps 展開並在當前 execution context 中執行。用途是把多個 test case 共用的步驟序列（例如登入、建房、啟動 fake server）集中管理，避免重複。

與 `include` 的差別：

| | `include` | `group` |
| --- | --- | --- |
| 載入的是 | 完整 test case（有 id、name） | 純粹的 step 集合 |
| 檔案位置慣例 | `testcases/` | `testcases/groups/` |
| context | 共享 | 共享 |

---

## Group 檔案格式

```json
{
  "name": "login",
  "description": "HTTP 登入並取得 token",
  "steps": [
    {
      "step_id": "http_login",
      "type": "http_request",
      "action": {
        "method": "POST",
        "url": "${ctx.base_url}/api/login",
        "payload": { "user": "test", "pass": "1234" }
      },
      "exports": [
        { "path": "body.token", "as": "ctx.token" }
      ]
    }
  ]
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `name` | string | ✅ | group 名稱，用於識別與除錯 |
| `description` | string | ❌ | 說明 |
| `steps` | array | ✅ | 展開執行的步驟，格式與 test case steps 相同 |

---

## Step Schema

```json
{
  "step_id": "setup_login",
  "type": "group",
  "description": "執行登入流程",
  "action": {
    "file": "testcases/groups/login.json"
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `file` | string | ✅ | 相對執行目錄的 group 檔案路徑 |

---

## Context 行為

Group 內的 steps 與 parent test case 共享同一個 `ExecutionContext`。Group 內 export 的變數，parent 後續步驟可直接使用。

---

## 目錄慣例

```text
testcases/
  groups/
    login.json
    setup_fake_servers.json
    setup_room.json
  sample/
    place_bet.json     ← 引用 groups
```

Group 檔案放在 `testcases/groups/`，不會被 catalog 掃描為 test case（catalog 只掃 testcases/ 下的 .json，但 groups/ 內的格式不符 TestCase schema，catalog 載入時會因缺少 `id` 或 `steps` 的 TestCase 結構而跳過或報錯）。

建議在 catalog 的 `load` 加一個 graceful skip：若 `id` 為空則跳過，不回傳 error。

---

## 錯誤語意

| 情境 | 行為 |
| --- | --- |
| 檔案不存在 | step 失敗，錯誤訊息帶 file path |
| JSON 格式錯誤 | step 失敗，錯誤訊息帶 parse error |
| group 內某步驟失敗 | group step 標記為失敗，parent runner 停止 |
| 循環引用 | 目前未偵測，需自行避免 |
