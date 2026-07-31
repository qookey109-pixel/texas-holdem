# Gemini Final Boss Worker

這個 Cloudflare Worker 是德州撲克網站與 Gemini API 之間的安全後端。

## 安全邊界

- `GEMINI_API_KEY` 只能放在 Cloudflare Secret，不得提交到 GitHub。
- 瀏覽器只會送出 Gemini 自己的兩張底牌與公開資訊。
- Worker 使用 JSON Schema 限制輸出，瀏覽器仍會再次驗證合法動作與加注範圍。
- API 超時、格式錯誤或非法動作時，遊戲會退回本地 AI。
- 預設只允許 `https://qookey109-pixel.github.io` 與本機測試來源。
- 預設每個來源位置每分鐘最多 20 次決策請求。

## 部署

```bash
cd backend/gemini-worker
npm install
npx wrangler login
npm run secret
npm run deploy
```

執行 `npm run secret` 後，終端機會要求輸入 Gemini API Key。不要把 Key 寫進指令、檔案、截圖或聊天紀錄。

部署完成後，Wrangler 會顯示類似：

```text
https://texas-holdem-gemini.<你的帳號>.workers.dev
```

回到遊戲：

```text
設定 → Gemini 後端 → 貼上 Worker 網址 → 儲存並測試
```

## 本機開發

建立不會被 Git 追蹤的 `.dev.vars`：

```text
GEMINI_API_KEY="你的測試金鑰"
```

然後：

```bash
npm run dev
```

前端後端網址可設定成 Wrangler 顯示的本機 URL，通常是 `http://localhost:8787`。

## 端點

- `GET /health`：檢查 Worker、模型與 Secret 是否已設定。
- `POST /v1/decision`：接收公開牌局狀態並回傳經驗證的 Gemini 決策。

正式模型預設為 `gemini-3.6-flash`，可在 `wrangler.jsonc` 的 `GEMINI_MODEL` 改成其他支援結構化輸出的穩定模型。
