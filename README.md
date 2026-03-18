# 要記得 2.0 OSS

`要記得 2.0 OSS` 是一個可自架的 LINE 提醒機器人。

這個開源版的定位很單純：
- 使用 `Google Apps Script`
- 使用 `Google Sheets` 當資料庫
- 讓使用者自己綁定 `LINE Messaging API`
- 自己部署自己的提醒機器人

如果你想直接使用、不要自己部署，這個專案的方向也保留了代管版路線；但這個 repository 本身聚焦在自架開源版。

## 功能範圍

目前開源版主打：
- `要記得`
- `查詢`
- `完成`
- `延後`
- `取消`

目前不包含代管版功能：
- `要記錄`
- `要反饋`
- `匯出記錄`
- 代管方案與後台營運能力

## 技術組成

- `Google Apps Script`
- `Google Sheets`
- `LINE Messaging API`

主要執行邏輯在這些檔案：
- [Code.js](/Users/angus/OpenCode/要記得2.0/Code.js)
- [Handlers.js](/Users/angus/OpenCode/要記得2.0/Handlers.js)
- [Utils.js](/Users/angus/OpenCode/要記得2.0/Utils.js)
- [DatabaseProvider.js](/Users/angus/OpenCode/要記得2.0/DatabaseProvider.js)

## 快速開始

### 1. 建立 Apps Script 專案

你可以：
- 直接在 Google Apps Script 建立新專案
- 或用 `clasp` 把這份程式推上去

如果你用 `clasp`，請先複製：

```bash
cp .clasp.json.example .clasp.json
```

然後把裡面的 `scriptId` 換成你自己的 Apps Script 專案 ID。

### 2. 設定 Script Properties

至少需要設定：

- `DATABASE_PROVIDER=SHEETS`
- `CHANNEL_ACCESS_TOKEN=<your line channel access token>`
- `SHEET_ID=<your spreadsheet id>`

如果沒有設定 `SHEET_ID`，程式會改用目前綁定的 spreadsheet。

### 3. 初始化 Google Sheets 結構

在 Apps Script editor 中執行：

```javascript
setupOpenSourceMode()
```

或至少執行：

```javascript
initializeCurrentDatabase()
setupTrigger()
```

### 4. 部署 Web App

把 GAS 專案部署成 Web App，然後把 URL 填回 LINE Webhook。

### 5. 驗證

建議依序執行：

```javascript
getOpenSourceSetupChecklist()
getOpenSourceHealthCheck()
getOpenSourcePublishChecklist()
```

## 可用指令

- `要記得 明天 9點 開會`
- `查詢`
- `完成 #<id>`
- `延後 #<id>`
- `取消 #<id>`

## 開源版 Helper

這些 helper 主要用在自架檢查與初始化：

- `setupOpenSourceMode()`
- `initializeCurrentDatabase()`
- `getOpenSourceSetupChecklist()`
- `getOpenSourceHealthCheck()`
- `getOpenSourcePublishChecklist()`
- `getRuntimeConfigSummary()`

## 專案結構

- `Code.js`: 入口、Webhook、Trigger
- `Handlers.js`: 指令處理與主流程
- `Utils.js`: 訊息、解析、Flex builders
- `DatabaseProvider.js`: `SUPABASE / SHEETS` provider 切換
- `Admin.js`: 初始化、自檢、營運 helper
- `Config.js`: 設定與 capability 控制

## .clasp.json 的開源處理

這個 repo 不應直接提交你自己的 `.clasp.json`，因為它會包含你真實的 Apps Script `scriptId`。

建議做法：
- 保留你本機自己的 `.clasp.json`
- 在版本控制中忽略 `.clasp.json`
- 提供一份 `.clasp.json.example` 給使用者自行複製

本 repo 已採用這種方式。

## 授權

本專案採用 [MIT License](./LICENSE)。
