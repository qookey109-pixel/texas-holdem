# Gemini Final Boss Cloudflare Worker

本目錄用於保存德州撲克 Gemini Final Boss 的 Cloudflare Worker 原始碼、部署契約與驗證方式。

## 目前狀態

- 正式 Worker 名稱：`texas-holdem-gemini`
- 正式 Worker base URL：`https://texas-holdem-gemini.q-oo109.workers.dev`
- 正式前端來源：`https://qookey109-pixel.github.io`
- Secret 名稱：`GEMINI_API_KEY`
- 預設模型：`gemini-3.6-flash`
- 最大請求大小：`20_000` bytes
- Worker 已在線上完成 `/health` 與 `/v1/decision` 驗證。
- **目前尚未把 Cloudflare Dashboard 中的精確 Worker 原始碼匯出到本目錄。**

在取得 Dashboard 的完整原始碼前，不得依照本文件摘要重新推測或重寫 `worker.js`，以免移除既有的 JSON fallback parsing、輸入清理、錯誤遮蔽或合法動作二次驗證。

## 預定檔案

```text
workers/gemini-final-boss/
├── README.md
└── worker.js
```

`worker.js` 必須直接來自目前已部署的 Cloudflare Dashboard 程式碼，並經過逐項核對後才可提交。

## 正式路由

```text
GET     /
GET     /health
POST    /v1/decision
OPTIONS /v1/decision
```

`/health` 的成功回應應包含：

```json
{
  "ok": true,
  "configured": true,
  "model": "gemini-3.6-flash"
}
```

## CORS

正式允許來源：

```text
https://qookey109-pixel.github.io
```

本機測試來源：

```text
http://localhost:4173
http://127.0.0.1:4173
```

不得恢復舊帳號來源：

```text
https://qoo109.github.io
```

不得改成任意來源 `*` 來開放 `/v1/decision`。

## Gemini 請求設定

目前部署版本使用：

```javascript
generationConfig: {
  maxOutputTokens: 1024,
  thinkingConfig: {
    thinkingLevel: "low",
  },
  responseMimeType: "application/json",
  responseSchema,
}
```

不得恢復已確認會失敗的舊格式：

```javascript
responseFormat: {
  text: {
    mimeType: "application/json",
    schema,
  },
}
```

## 必須保留的安全與容錯功能

匯入 `worker.js` 時必須確認仍包含：

- 請求大小限制
- 合法動作白名單
- CORS 來源限制
- 輸入資料清理
- 其他玩家底牌排除
- Gemini 回傳 JSON 多重解析
- Markdown code fence 移除
- JSON object 擷取
- 動作與加注金額二次驗證
- API Key 與內部錯誤訊息遮蔽
- 無快取 JSON 回應
- `/health` 健康檢查

前端 `js/gemini-backend-client-v2.js` 仍會再次檢查合法動作與加注範圍；Worker 端驗證不得因此移除。

## 匯出 Worker 原始碼

1. 開啟 Cloudflare Dashboard。
2. 進入 `Workers & Pages`。
3. 選擇 `texas-holdem-gemini`。
4. 開啟目前正式部署版本的程式碼編輯器。
5. 複製完整程式碼，不要複製或顯示 Secret 值。
6. 保存為：

```text
workers/gemini-final-boss/worker.js
```

7. 核對本文件列出的模型、CORS、路由、解析與安全功能。
8. 執行語法檢查：

```bash
node --check workers/gemini-final-boss/worker.js
```

9. 確認 Git diff 不含 API Key、Token、Cookie、Authorization 或其他憑證。
10. 使用獨立分支與 Pull Request，不得直接寫入 `main`。

## 驗證清單

### 健康檢查

```bash
curl -sS https://texas-holdem-gemini.q-oo109.workers.dev/health
```

### CORS preflight

確認允許正式 Pages 來源，並拒絕未列入白名單的來源。

### 決策契約

至少驗證：

- 無效 JSON 回傳 `400`
- 過大請求被拒絕
- 不合法 `legalActions` 被拒絕
- Gemini 回傳不合法 action 時被拒絕
- Raise 低於最小值或高於最大值時被拒絕
- 其他玩家底牌不會出現在傳送資料中
- 無 Secret 時 `/health` 或決策端點明確失敗
- Gemini 失敗時前端仍會切回本地 AI，不會卡住牌局

## Secret 規則

- `GEMINI_API_KEY` 只能存在 Cloudflare Worker Secret。
- 不得放進前端 JavaScript、GitHub、README、Issue、PR、聊天內容或截圖。
- Worker URL 可以公開，Secret 值不可以公開。
- 若 Key 疑似外洩，立即在 Google AI Studio 撤銷並重建，再更新 Cloudflare Secret。
