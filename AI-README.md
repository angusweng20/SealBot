# AI README

這份文件是寫給 AI agent 看，不是寫給一般終端使用者看。

適用對象包括：
- OpenCode
- Codex
- Claude Code
- Cursor
- 其他能讀取 repository 並產生安裝教學的對話型 AI

## 專案定位

這是一個「純開源、自架、Google Sheets 當資料庫」的 LINE 提醒機器人。

請不要把它描述成：
- SaaS
- Supabase 專案
- 有內建付費方案
- 有管理後台
- 有要記錄 / 要反饋 / 匯出記錄

這個 repository 只保留開源版能力。

## 目前功能

只支援：
- `要記得`
- `查詢`
- `完成`
- `延後`
- `取消`

不支援：
- `要記錄`
- `要反饋`
- `匯出記錄`
- 任何 hosted / paid / admin 功能

## 技術事實

這個專案：
- 跑在 `Google Apps Script`
- 使用 `Google Sheets` 作為資料庫
- 使用 `LINE Messaging API`
- 透過 GAS Web App 接收 webhook
- 透過 `setupTrigger()` 建立每分鐘檢查提醒的 trigger

主要檔案：
- `Code.js`
- `Handlers.js`
- `Utils.js`
- `Database.js`
- `Admin.js`
- `Config.js`

## AI 的任務目標

如果使用者要求你幫他部署這個專案，你的目標應該是：

1. 先確認他是要「自己部署開源版」
2. 明確告訴他這不是代管版
3. 引導他準備必要的 LINE 與 GAS 設定
4. 產出一份按順序可執行的教學
5. 只有在需要敏感資訊時才停下來向使用者索取

## AI 不應做的事

不要：
- 幻覺出 Supabase 步驟
- 幻覺出額外的後台頁面
- 幻覺出 `DATABASE_PROVIDER=SUPABASE`
- 假設使用者已經會 Google Apps Script
- 假設使用者知道如何建立 LINE Messaging API channel
- 一開始就要求一大堆憑證

## AI 應該先蒐集的最少資訊

在真正安裝前，AI 最多只需要先確認：

1. 使用者是否已有 LINE Developers channel
2. 使用者是否已有 Channel Access Token
3. 使用者是否已有 Google Sheet
4. 使用者是要手動用 GAS UI，還是用 `clasp`

如果這些還沒有，就先教他建立，不要跳步。

## 必要設定

至少需要這些 Script Properties：

- `CHANNEL_ACCESS_TOKEN`
- `SHEET_ID`

說明：
- `CHANNEL_ACCESS_TOKEN` 來自 LINE Messaging API
- `SHEET_ID` 是 Google 試算表 ID
- 如果沒有設定 `SHEET_ID`，程式會改用目前綁定的 spreadsheet

## 標準部署流程

AI 產出的部署教學應優先使用這個順序：

1. 建立或準備 Google Sheet
2. 建立或準備 Google Apps Script 專案
3. 把 repository 程式放進 Apps Script
4. 設定 Script Properties
5. 執行 `initializeCurrentDatabase()`
6. 執行 `setupTrigger()`
7. 部署成 Web App
8. 把 Web App URL 填到 LINE Webhook
9. 執行 `getOpenSourceHealthCheck()`
10. 用 LINE 實測指令

## 建議 AI 產出的實測順序

部署完成後，應該引導使用者至少測：

1. `要記得 明天 9點 開會`
2. `查詢`
3. `延後 #<id>`
4. `完成 #<id>`
5. `取消 #<id>`

## 可呼叫的 helper

AI 應優先利用這些 helper 來做自檢與教學：

- `initializeCurrentDatabase()`
- `setupOpenSourceMode()`
- `getOpenSourceSetupChecklist()`
- `getOpenSourceHealthCheck()`
- `getOpenSourcePublishChecklist()`
- `getRuntimeConfigSummary()`

## AI 生成教學時的語氣建議

請用：
- 清楚
- 分步
- 避免預設使用者懂技術
- 每一步都說明「做完後應看到什麼」

請不要用：
- 過度專業縮寫
- 一次丟太多背景解釋
- 把所有選項一次展開

## AI 可直接給出的安裝步驟骨架

如果使用者要你直接給教程，可以從這個骨架開始：

1. 建立一個 Google Sheet
2. 建立一個 Apps Script 專案並貼上這個 repo 的檔案
3. 在 Script Properties 加入 `CHANNEL_ACCESS_TOKEN` 與 `SHEET_ID`
4. 執行 `initializeCurrentDatabase()`
5. 執行 `setupTrigger()`
6. 部署成 Web App
7. 到 LINE Developers 設定 Webhook URL
8. 執行 `getOpenSourceHealthCheck()`
9. 用 LINE 傳送 `要記得 明天 9點 開會`

## AI 在何時應該停下來問使用者

只有在以下情況才停下來：

- 需要使用者提供 `CHANNEL_ACCESS_TOKEN`
- 需要使用者提供 `SHEET_ID`
- 需要使用者提供 Apps Script `scriptId`
- 需要使用者貼出 Web App URL 或 LINE Webhook 設定結果

## 這份文件的商業目的

這份 AI 文件的目的不是把安裝流程包裝成零摩擦，而是：

- 讓 AI 可以真的協助部署
- 讓技術使用者有機會自己裝起來
- 同時讓非技術使用者明白「即使有 AI 幫忙，部署仍然有一些步驟與設定成本」

因此，AI 產出的教學應該：
- 真實
- 可執行
- 不誇大簡單度

讓使用者自然理解：
- 可以自己裝
- 但如果覺得麻煩，也很合理會想找人代裝或使用代管版
