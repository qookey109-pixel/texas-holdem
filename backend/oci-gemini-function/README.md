# OCI Gemini Final Boss Backend

這個目錄提供 Oracle Cloud Infrastructure 版本的 Gemini 後端，與現有 Cloudflare Worker 並存。

前端介面不需要修改；只要最後取得的 API Gateway 網址支援：

- `GET /health`
- `POST /v1/decision`

遊戲的「設定 → Gemini 後端」可直接使用該網址。

## 安全邊界

- Gemini API Key 存在 OCI Vault Secret，不放在 GitHub、前端或 Function 原始碼。
- Function 透過 Resource Principal 讀取指定 Secret。
- 瀏覽器只傳 Gemini 自己的兩張底牌與公開資訊。
- Gemini 輸出先受 JSON Schema 限制，再由 Function 與瀏覽器各驗證一次。
- API Gateway 範例限制每個 Client IP 每秒 2 次請求。
- Gemini 失敗、逾時或回傳非法動作時，牌局會自動使用本地 AI。

## 需要的 OCI 資源

1. OCI Functions Application
2. OCI Vault、Master Encryption Key、Secret
3. Dynamic Group 與 IAM Policy
4. Public API Gateway 與 API Deployment

全部可以從 Oracle Cloud 網站與 Cloud Shell 完成，不需要在 Mac 安裝 Node.js。

## 一、建立 Vault Secret

在 OCI Console：

```text
Identity & Security
→ Vault
→ Create Vault
→ Create Master Encryption Key
→ Create Secret
```

建議 Secret 名稱：

```text
GEMINI_API_KEY
```

Secret 內容貼上 Gemini API Key。不要把 Key 貼到聊天、GitHub、Function 設定或截圖。

建立完成後，複製 **Secret OCID**；它不是 API Key，可以安全地用於 Function 設定。

## 二、建立 Functions Application

依照 OCI Functions Cloud Shell QuickStart 建立 Application。建議名稱：

```text
texas-holdem-gemini-app
```

Functions Application 必須位於可連外的 VCN/Subnet，才能呼叫 Gemini HTTPS API。

## 三、從 Cloud Shell 部署 Function

打開 OCI Console 右上角的 Cloud Shell，執行：

```bash
git clone https://github.com/qoo109/texas-holdem.git
cd texas-holdem/backend/oci-gemini-function
fn -v deploy --app texas-holdem-gemini-app
```

若 Repository 已存在：

```bash
cd texas-holdem
git pull
cd backend/oci-gemini-function
fn -v deploy --app texas-holdem-gemini-app
```

部署後，在 OCI Console 的 Function 詳細頁加入 Configuration：

```text
GEMINI_SECRET_OCID = 你的 Vault Secret OCID
```

預設設定已包含：

```text
GEMINI_MODEL = gemini-3.6-flash
ALLOWED_ORIGINS = https://qoo109.github.io
```

也可以在 Cloud Shell 設定：

```bash
fn config function texas-holdem-gemini-app texas-holdem-gemini-oci \
  GEMINI_SECRET_OCID 'ocid1.vaultsecret...'
```

## 四、授權 Function 讀取 Secret

建立 Dynamic Group，建議名稱：

```text
TexasHoldemGeminiFunctions
```

Matching rule：

```text
ALL {resource.type = 'fnfunc', resource.compartment.id = '<FUNCTION_COMPARTMENT_OCID>'}
```

建立 IAM Policy，使用最小權限，只允許讀取這一個 Secret：

```text
Allow dynamic-group TexasHoldemGeminiFunctions to read secret-bundles in compartment <VAULT_COMPARTMENT_NAME> where target.secret.id='<SECRET_OCID>'
```

Policy 或 Dynamic Group 修改後，Resource Principal 權限可能需要等待約 15 分鐘才完全生效。

## 五、建立 API Gateway

建立 Public API Gateway，並讓 Gateway 能呼叫 Function。

建立 Gateway Dynamic Group，建議名稱：

```text
TexasHoldemGeminiGateway
```

Matching rule：

```text
ALL {resource.type = 'ApiGateway', resource.compartment.id = '<GATEWAY_COMPARTMENT_OCID>'}
```

IAM Policy：

```text
Allow dynamic-group TexasHoldemGeminiGateway to use functions-family in compartment <FUNCTION_COMPARTMENT_NAME>
```

## 六、建立 API Deployment

取得 Function OCID，複製：

```text
api-gateway-spec.example.json
```

把兩個：

```text
REPLACE_WITH_FUNCTION_OCID
```

替換成真正 Function OCID。

在 API Gateway 建立 Deployment：

```text
Path prefix：/texas-holdem-gemini
Specification：使用更新後的 JSON
```

Specification 已包含：

- CORS 僅允許 `https://qoo109.github.io`
- `GET /health`
- `POST /v1/decision`
- 每個 Client IP 每秒最多 2 次請求

最終 base URL 會類似：

```text
https://<gateway-host>/texas-holdem-gemini
```

## 七、測試

Cloud Shell 或瀏覽器測試：

```bash
curl 'https://<gateway-host>/texas-holdem-gemini/health'
```

成功應回傳類似：

```json
{
  "ok": true,
  "service": "texas-holdem-gemini",
  "provider": "oci-functions",
  "configured": true,
  "model": "gemini-3.6-flash"
}
```

若 `configured` 是 `false`，表示 `GEMINI_SECRET_OCID` 尚未加入 Function Configuration。

## 八、連接遊戲

回到德州撲克：

```text
設定
→ Gemini 後端
→ 貼上 API Gateway base URL
→ 儲存並測試
→ 挑戰 Gemini
```

只貼 base URL，不要在網址後面加 `/health` 或 `/v1/decision`。

## API 相容性

這個 OCI 後端與 Cloudflare Worker 使用相同回應格式，因此前端不需要知道目前連的是哪一家雲端服務。
