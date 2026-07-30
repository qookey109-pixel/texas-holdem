# 聊天附件匯入狀態

匯入日期：2026-07-29  
來源：`/Users/qoo/Downloads/texas_holdem_chat_files_bundle_2026-07-29/`

## 用途

這個資料夾保存 ChatGPT File Library 可辨識的德州撲克歷史附件、附件清單與交接文件，供日後查閱、比對與人工挑選素材。

## 正式程式來源

目前正式可執行程式仍在 Repository root：

- `index.html`
- `styles.css`
- `app.js`
- `js/`

匯入的 `recovered_snippets/` 只屬於歷史參考，**不會被網站載入，也不可直接覆蓋正式程式**。

## 資料可靠性

- 匯入包內的 `德州撲克_專案總Handoff_2026-07-29.md` 是歷史交接紀錄；其中的 GitHub 404 與舊提交資訊不代表目前本機正式狀態。
- 本次匯入時的本機正式提交為 `8d15895a3e9dc4d73aaab0664b6fa046da88f89f`。
- 需要修改功能時，先讀取 Repository root 的 `PROJECT_STATUS.md`、`README.md` 與 `AGENTS.md`。

## 匯入內容

- `德州撲克_專案總Handoff_2026-07-29.md`：原始歷史交接文件。
- `德州撲克_聊天室附件清單.*`、`file_library_manifest.json`：附件索引與識別資料。
- `recovered_snippets/`：舊原型／素材的可辨識文字片段。

## 維護規則

1. 新的聊天附件以日期新增新的子資料夾，不覆蓋舊匯入。
2. 將任何歷史片段採用到遊戲前，必須先以正式程式碼與測試確認差異。
3. 不將下載素材原檔、帳號資訊或 API Key 納入此資料夾。
