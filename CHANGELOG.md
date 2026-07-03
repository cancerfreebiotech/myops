# Changelog

All notable changes to this project will be documented in this file.

## v0.5.4 — 教育訓練與證照管理（2026-07-03）

### Added
- **教育訓練**：新頁面 `/training` — 訓練課程建立與指派（含教材連結、必修標記）、員工標記完成並上傳結業證明、年度累計時數統計、課程完成進度總覽
- **證照管理**：員工證照檔案（GCP、生安、輻安等）登錄、到期日追蹤；30 天內到期顯示「即將到期」標示；管理者「到期提醒」分頁列出 60 天內到期證照
- **儀表板**：新增「證照將到期」卡片（訓練管理者限定）
- 新增可指派權限「訓練與證照管理」（training_manage）

## v0.5.3 — 資產與儀器管理（2026-07-03）

### Added
- **資產與儀器管理**：新頁面 `/assets` — 資產台帳（IT 設備/實驗儀器/傢俱）、保養/校驗/維修/領用/歸還記錄（含附件）、校驗與保養到期追蹤；保養或校驗記錄完成後自動排下次到期日；領用/歸還自動更新保管人
- **到期提醒**：資產頁「到期提醒」分頁列出 60 天內到期項目；儀表板新增「校驗/保養將到期」卡片（30 天內）
- 新增可指派權限「資產管理與記錄」（asset_manage）；一般員工可檢視資產清單（唯讀）

### Fixed
- **權限指派清單對齊**：修正多個在管理介面可指派、但系統從未檢查的無效權限（如舊的薪資檢視 key）— 現在清單上的每個權限都真實生效；薪資的檢視/財務確認/最終核准三種權限現在可正確指派

## v0.5.2 — 統一簽核中心（2026-07-03）

### Added
- **簽核中心**：新頁面 `/approvals` 彙總所有待你審核的申請 — 請假、加班、補打卡、報帳、文件/合約、薪資、採購 — 不用再逐頁巡，一鍵核准或退回
- **補打卡審批**：主管現在可以核准/退回補打卡申請，核准後自動寫入當日出勤記錄（此前補打卡送出後無人能處理）
- **儀表板**：具報帳審批權限者的「今日待辦」新增「待審報帳」卡片

### Security
- 修復文件更新 API 缺少授權檢查的問題（原本任何登入者皆可變更文件狀態），現限管理員與具合約審核權限者

## v0.5.1 — 員工報帳模組（2026-07-03）

### Added
- **員工報帳**：代墊費用線上申請 — 選類別（交通/差旅/誤餐/用品/其他）、上傳發票照片或 PDF、送出後由具審批權限的同仁核准與撥付；申請人可隨時查看進度、取消待審核的申請；財務可一鍵匯出 Excel 明細
- 新增可指派權限「報帳審批與撥付」（expense_approve），審批動作需完成 MFA 驗證

## v0.5.0 — 品質修正與細節優化（2026-07-03）

### Fixed
- **無權限導向一致化**：專案詳情頁與每日報告團隊頁在沒有權限時，統一顯示水墨山水無權限頁面（原本靜默跳回列表頁）
- **每日報告 — KPI 輸入**：清空欄位不再誤存為 0；輸入完成才儲存，儲存失敗會顯示錯誤
- **每日報告 — 日期時區**：「今天」改以台北時間計算，海外或跨時區使用不會差一天

### Changed
- 內部程式碼品質整理（lint 歸零、移除殘留檔案）

## v0.4.9 — 權限系統重大修復（2026-07-02）

### Fixed
- **一般員工看不到任何功能**：修正 feature flags 讀取權限問題 — 非管理員登入後所有模組（打卡、請假、文件、每日報告等）都無法使用、被導向無權限頁面。現在所有員工都能正常看到已開啟的功能模組
- **每日報告 — 子任務勾選無法儲存**：勾選後重新整理會恢復原狀，已修正儲存路徑
- **每日報告 — 成員任務列表載入失敗**：修正查詢語法，成員現在能正常看到被指派的任務
- **每日報告 — 操作失敗時仍顯示成功**：任務完成、確認、刪除等操作現在會正確檢查結果，失敗時顯示錯誤提示

### Security
- **每日報告權限收緊**：viewer 僅能管理自己群組的任務（原本可跨群組）；成員僅能更新任務完成狀態（原本可改任何欄位）；已刪除群組的 viewer 不再能存取前成員資料

## v0.4.7 — 無權限頁面優化（2026-06-22）

### Changed
- **無權限頁面**：說明文字與返回按鈕移至詩詞上方，操作更直覺；深色模式改為水墨深夜色調；手機版觸控按鈕加大至 44px，竹枝裝飾適配小螢幕

## v0.4.6 — 無權限頁面上線（2026-06-22）

### Added
- **無權限頁面**：沒有存取權限時不再靜默跳回首頁，改顯示水墨山水畫風格頁面，引用葉紹翁《遊園不值》「小扣柴扉久不開」，說明無法進入的原因，並提供返回按鈕

## v0.4.3 — 頁面測試中標示（2026-06-18）

### Changed
- **測試中標示**：各功能頁面標題旁統一顯示黃色「測試中」提示框，提醒現階段為員工測試期

## v0.4.2 — 手機導覽優化（2026-06-18）

### Changed
- **手機版底部導覽**：「每日報告」移至「更多」面板首位，方便快速存取

## v0.4.1 — 側欄導覽優化（2026-06-18）

### Changed
- **側欄**：「每日報告」區段移至文件管理之上，符合日常使用優先順序

## v0.4.0 — 每日報告模組上線（2026-06-18）

### Added
- **每日報告模組**：業務同仁可在 myOPS 直接填報每日行程、完成回報、KPI 數值，取代原有獨立網站
- **每日填報**：行程 / 完成回報 / KPI 三個分頁，支援一鍵套用常用樣板
- **我的任務**：查看主管指派的任務與子任務，完成後可直接標記回報
- **團隊總覽**：主管（Viewer）可查看所屬群組所有成員的當日報告
- **群組管理**（管理員）：可建立群組、指派成員與主管，彈性對應各部門結構

### 操作說明
管理員請先至**設定 → 功能開關**啟用「每日報告」，再至**每日報告群組**建立群組並指派成員。

## [0.3.8] - 2026-06-15

### Changed
- **Teams 通知改走 Dr.Ave Gateway**：myOPS 不再各自直連 Bot Framework，所有通知（請假結果、採購簽核、打卡提醒、每日摘要、公告、薪資單）改呼叫共用閘道 `drava.cancerfree.io/api/notify`；收件人以 email 識別、查無 conversation reference 時優雅略過

### Added
- **Teams 可操作簽核卡片**：簽核請求以帶按鈕的卡片送出，主管可直接在 Teams 核准/退回
- **一鍵簽核政策後台**（`/admin/bot-policy`）：管理員逐功能開關「Teams 一鍵直簽」、金額型單據設門檻；預設全關（走深連結 + MFA，最安全）
- **bot-facing API**：`/api/bot/approve`、`/api/bot/query`（Dr.Ave 以 `BOT_GATEWAY_TOKEN` 回呼）；一鍵簽核執行前再驗政策門檻，audit 標記 `via=teams_one_tap`

### Removed
- myOPS 自有 Teams webhook（`/api/teams/bot`）— 已由 Dr.Ave 集中承載

## [0.3.7] - 2026-06-15

### Changed
- **採購列表全面強化**：9 個列表（詢價/請採購/進貨驗收/出入庫×3/請款×3/廠商/商品/評估×2/待簽收件匣）統一加上
  - 欄位排序（點標題切換，金額/數量/日期依型別正確排序、空值排最後）
  - 即時搜尋（涵蓋表內全部可見欄位；詢價/請採購另保留伺服器端單號/廠商搜尋）
  - 每頁 20 筆分頁（搜尋/排序自動回第一頁，單頁時自動隱藏）

## [0.3.6] - 2026-06-12

### Changed
- **採購總覽改版為 Dashboard**：模組卡片附即時筆數（廠商/商品/各單據），近效期批號（60 天內）黃色警示卡直達庫存頁；「我的待簽」保留置頂
- **詳情頁返回**：所有採購詳情頁統一加「返回」（記住上一頁，無歷史則回列表）
- **移除頁尾**：版本與部署時間 Sidebar 已有，頁尾資訊列移除

## [0.3.5] - 2026-06-12

### Added
- **採購模組 Phase C：Ragic 歷史資料匯入完成（19 張表 4,768 筆，筆數 100% 吻合）**
  - 主檔：倉庫 6、廠商 50、商品 238、廠商報價 367、批號庫存 240
  - 單據：詢價 231、請採購 253（明細 425）、進貨驗收 266、入庫 240（明細 294）、出庫 534（明細 633）、請款 16+161+13、評估 49+243
  - 庫存分類帳回填 927 筆異動；單號沿用 Ragic 原編號；舊單號對照表（ragic_id_map）2,952 筆
  - FK 完整性全數通過；簽核時間軸對歷史單顯示「Ragic 歷史單據」標記
  - 匯入工具入庫（`scripts/import-ragic/`，支援 dry-run）

### Chore
- 已知待處理（不影響上線）：6 筆簽核中歷史單需人工重送簽；20 個批號存在 Ragic 時期盤差（在庫量以 Ragic 主檔為準已正確）；11 位 Ragic 經手人在 myOPS 無帳號，歷史單據暫掛管理員名下（原名保留於備註）

## [0.3.4] - 2026-06-12

### Added
- **採購模組 Phase B（完整單據鏈，feature flag 仍關閉）**
  - 八種單據完整 CRUD + 表單：詢價單（簽核中欄位鎖定）、請採購單（明細編輯器、金額自動計算）、進貨驗收單（訂金區塊）、入庫/出庫單、訂金/採購/分期請款單
  - **轉單**：六條轉換（詢價→採購→進貨→入庫；採購→訂金請款；進貨→請款→分期），PR→GR 自動帶入已過簽訂金資訊
  - **庫存過帳**：原子交易 Postgres 函式（批號自動判斷加量/新建、寫入分類帳、冪等保護、超扣攔截、可沖銷）
  - **條碼掃描（mobile-first）**：掃描槍 + 手機相機（BarcodeDetector / zxing fallback），入庫出庫掃碼自動加減量、震動回饋
  - **作廢並複製**：過簽單據可作廢重開（GR 有下游請款/入庫時清楚攔截提示）——解決舊系統簽核後無法修正的痛點
  - **商品出入庫分類帳頁**：年度流水 + 結餘、批號在庫與效期警示、總量以庫存單位一致顯示——解決舊系統紀錄要手動整理的痛點
  - prod 完整鏈 SQL e2e 驗證 25/25 通過

## [0.3.3] - 2026-06-12

### Added
- **採購模組 Phase A（地基，feature flag 預設關閉）**：自 Ragic 採購系統 migrate 的第一階段
  - 資料庫：21 張新表（廠商/商品/廠商報價主檔、倉庫/批號庫存、庫存分類帳 `stock_movements`、10 種單據骨架、簽核步驟表），已套用至 prod，RLS 全啟用
  - 單據自動編號：`next_doc_no()`（前綴-年月-流水，並發安全），BEFORE INSERT trigger 自動產號
  - **多關卡簽核引擎**：10 條簽核鏈（角色制：部門主管/COO/CEO/會計），簽核人支援角色/直屬主管/單據欄位動態/任意確認四型；核准拒絕沿用 MFA（AAL2）閘 + 審計日誌 + Teams 通知；過簽自動執行登錄（廠商評估→廠商清冊、商品評估→廠商商品價格）
  - 商品主檔導入**雙單位制**（採購單位/庫存單位/換算率），解決報價以箱、出庫以瓶的單位不一致問題
  - 頁面：採購總覽（我的待簽收件匣）、廠商主檔、商品主檔、廠商/商品審核評估（含簽核時間軸）
  - 權限：新增 `ceo` 職務角色與 `procurement_unit` / `procurement_manage` / `procurement_payment_approve` 三個特殊權限
  - i18n：`procurement` 命名空間 256 個 key 三語同步
- 後續：Phase B（詢價→採購→進貨→出入庫單據鏈、條碼掃描、作廢重開、出入庫分類帳頁）、Phase C（Ragic 歷史資料匯入）完成後開啟功能

## [0.3.2] - 2026-06-11

### Docs
- **使用說明書上線**（`docs/generated/`）：user / admin 兩種角色 × 中／英／日三語共 6 份，含工作流程圖（mermaid）與 FAQ
- **PRD 與現況同步**：PRD.md 任務清單 57 項逐一對照程式碼勾選（3 項標註未實作）、新增現況說明章節；Teams Bot PRD（myOPS-PRD-v0_3.md）標記結案（T64–T73 完成，T63 待 Azure 手動設定）

## [0.3.1] - 2026-06-11

### Added
- **Teams Bot 整合（PRD T63–T72）**：提醒與通知正式接上 Microsoft Teams
  - `src/lib/teams-bot.ts`：Bot Framework token 快取與 proactive messaging（無 conversation reference 安靜跳過，發送失敗不影響主流程）
  - `/api/teams/bot` webhook：驗證 Bot Framework JWT（jose），`conversationUpdate` 時以成員 email 對應使用者並儲存 conversation reference
  - 接線完成：每日待辦摘要（T67）、上下班打卡提醒（T68）、即時通知（T69）、請假審核結果（T70）、薪資單發出（T71）、公告發布（T72）
  - 訊息依**收件人**的 `users.language` 三語發送（新增 `teamsMessages` 命名空間）
  - `teams_conversation_references` migration 與 `docs/teams-bot-setup.md`（Azure Bot 設定手冊）

## [0.3.0] - 2026-06-11

### Fixed
- **Cron 端點被登入攔截**：`proxy.ts` 把 Vercel Cron 的請求（無 session cookie）一律 307 轉向 /login，排程永遠打不到 route——三個 cron 端點（clock-reminder、daily-digest、notify）加入 middleware 豁免清單，依賴各自的 fail-closed CRON_SECRET 驗證（payroll 端點不豁免，維持 MFA 強制檢查）

### Chore
- 版本進位：依新規則（patch 最大 9）自 v0.2.50 進位至 v0.3.0

## [0.2.50] - 2026-06-11

### Added
- **平板 Drawer 側欄**：md–lg 區間新增頂部列 + 漢堡選單，點擊滑入完整側欄（遮罩關閉、ESC、路由切換自動收合），桌面與手機行為不變
- **Vercel Cron 排程**（`vercel.json`）：每日待辦摘要平日 08:30、打卡提醒平日 07:00（上班）/ 17:30（下班）（台北時間）；cron route 補上 GET handler 並依台北時間自動判斷提醒類型

### Changed
- **程式碼品質**：清除全部 248 個既有 ESLint 問題（`any` 改為實際型別、移除未用變數、effect 內 setState 重構、hook 依賴修正；僅保留 1 處經評估不可安全改動者），並修正公告列表搜尋競態問題
- **CI**：GitHub Actions 升級 checkout/setup-node v5、Node 24；新增 `.gitattributes` 強制 LF 換行

### Security
- **Cron 端點改為 fail-closed**：`notify`、`clock-reminder`、`daily-digest` 在 `CRON_SECRET` 未設定時一律拒絕（原為 fail-open）——部署需設定 `CRON_SECRET` 環境變數

## [0.2.49] - 2026-06-10

### Fixed
- **API 錯誤訊息多語化**：21 個 API route 的錯誤回應改為依使用者語言回傳（next-intl 伺服器端翻譯，新增 `apiErrors` 命名空間；Teams 機器人訊息與匯出報表內容維持原樣）
- **觸控目標**：按鈕、側欄、底部導覽在觸控裝置上保證 ≥44px（Tailwind `pointer-coarse:` variant，桌面密度不變）
- **表格手機橫向捲動**：出勤紀錄與使用者列表表格補上 `overflow-x-auto`
- **Dark mode 對比**：移除 16 處 `text-white` 直書（改 `text-gray-50` 或補 `dark:` variant），修正勞健保上傳區與出勤管理表頭的深色模式對比

### Security
- `/api/teams/notify` 加上 CRON_SECRET Bearer 驗證（比照其他 cron 端點）

## [0.2.48] - 2026-06-10

### Fixed
- **i18n 全面補洞**：抽出 22 個元件中約 218 條 hardcode 中文字串，改為 next-intl `t()` 翻譯鍵，zh-TW / en / ja 三語檔同步新增（涵蓋 admin 管理頁表頭、按鈕、placeholder、aria-label、toast 訊息等）
- **回饋管理截圖**（`/admin/feedback`）：原生 `<img>` 改為 `next/image`（fill + aspect-video 容器，避免 layout shift）

### Added
- **Footer**：掛載至 dashboard layout，依 PRD 固定格式顯示 `坂本 | v{version} | Deployed: {time}`（讀取 `NEXT_PUBLIC_AUTHOR_NAME` / `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_DEPLOY_TIME`）

### Chore
- 三語訊息檔結構驗證一致（各 995 個 leaf key）；`npm run build` 通過

## [0.2.47] - 2026-04-10

### Changed
- **HR 管理頁面**（`/admin/hr-settings`）：直接嵌入假別管理、假別額度、加班費率、出勤異常、獎金管理功能，移除外部連結
- **財務管理頁面**（`/admin/finance-settings`）：直接嵌入勞健保級距表、薪資異常檢查功能，移除外部連結
- **Sidebar**：移除 7 個已嵌入設定頁的獨立管理項目（leave-types, leave-balances, overtime-rates, attendance-anomalies, bonuses, insurance-brackets, payroll/anomalies）
- **管理組件 readOnly 支援**：LeaveTypesManager、LeaveBalancesManager、OvertimeRatesManager、BonusClient、InsuranceBracketsClient 加上 `readOnly` prop，COO 角色唯讀檢視

### Removed
- `HRManagementLinks` 組件（功能已嵌入 HR 管理頁）
- `FinanceManagementLinks` 組件（功能已嵌入財務管理頁）

## [0.2.44] - 2026-04-08

### Added
- **職能角色系統（job_role）**：新增 `job_role` 欄位（member / hr_manager / finance / coo）
  - DB migration：`users.job_role` 欄位，並將舊 `granted_features` 中的角色標記自動遷移
  - HR 角色：可修改部門/職位/停用帳號，不可更改系統角色
  - Finance 角色：可存取加班費率管理、勞健保級距管理（原本僅 Admin）
  - COO 角色：可管理 COO 設定、唯讀 HR/Finance 設定
- **職能角色預設功能矩陣**（`src/lib/job-role-features.ts`）
- **財務管理頁**新增費率管理連結（加班費率、勞健保級距）
- **使用者管理頁**：HR 角色可存取，但僅能修改允許欄位

### Changed
- `src/lib/features.ts`：移除角色標記（hr_manager / finance_payroll / coo_notify），新增 12 個個別指派功能
- `src/lib/role-settings.ts`：`KEY_OWNER` 對應值改為 job_role 識別碼
- 設定頁存取改為檢查 `job_role` 而非 `granted_features`
- `UserEditForm`：新增職能角色欄位（Admin 才能修改），角色/個別授權僅 Admin 可見
- Sidebar：非 Admin 的 HR/Finance/COO 顯示對應管理頁連結

## [0.2.33] - 2026-04-07

### Fixed
- CI build 修復：將 `feature-flag-keys.ts` 拆出為 client-safe 常數檔
  - `SettingsClient.tsx`（Client Component）原本 import `feature-flags.ts` 導致 `next/headers` 被打包進 client bundle，Turbopack 報錯
  - 現在 client 元件只 import `feature-flag-keys.ts`（無 server 依賴）
  - `Sidebar.tsx` / `BottomNav.tsx` 的 `import type { FeatureFlags }` 同步改為 `feature-flag-keys.ts`

## [0.2.32] - 2026-04-07

### Fixed
- 手機版 BottomNav「更多」面板補上「專案」與「個人設定」連結，與桌面版 Sidebar 功能對齊

## [0.2.31] - 2026-04-06

### Fixed
- Sidebar / BottomNav 語言切換：`supabase.update().catch()` 改用 `Promise.resolve(...).catch()`，修正 PostgREST builder 不實作 `.catch()` 導致的 runtime 錯誤

## [0.2.30] - 2026-04-06

### Added
- 功能開關系統（Feature Flags）
  - Admin 系統設定頁新增「功能開關」區塊，支援 toggle 開啟/關閉各功能模組
  - 9 個可控功能：出勤、請假、加班、薪資、文件、公告、合約、專案、意見回饋
  - 預設：意見回饋開放，其餘關閉（待測試後由管理員手動開啟）
  - Admin 不受開關限制，永遠可存取所有功能
- Sidebar / BottomNav 自動隱藏已關閉的功能連結
- 各功能頁 route 層保護：非 admin 直接打 URL 也會 redirect 回首頁

## [0.2.29] - 2026-04-06

### Added
- 說明文件頁面新增「使用者功能矩陣」表格
  - 6 個功能分區：出勤、請假/加班、薪資、文件管理、公告/合約、專案/其他
  - 4 種角色權限：一般員工、主管、HR、系統管理員
  - 三語言完整支援（zh-TW/en/ja）
  - ✓ 完整存取 / △ 部分存取 / — 無存取，顏色視覺化標示

## [0.2.28] - 2026-04-06

### Fixed
- 語言切換 DB update 加 `.catch(() => {})`，Supabase reject 時不阻擋 navigation

## [0.2.27] - 2026-04-06

### Fixed
- Sidebar / BottomNav 語言切換 DB update 改為 `Promise.race` + 2 秒 timeout，避免 Supabase 慢或失敗時卡住

## [0.2.26] - 2026-04-05

### Fixed
- Cookie `secure` flag 改為 `process.env.NODE_ENV === 'production'`，本機開發（HTTP）不再失效
- BottomNav 語言切換 DB update 改為 `await`，確保寫入完成再跳轉

## [0.2.25] - 2026-04-05

### Added
- 新增說明文件頁面 `/help`（登入後可存取，三語言完整內容）
  - 11 個功能模組說明：儀表板、文件、公告、合約、出勤、請假、加班、薪資、專案、回饋、設定
  - 每個模組包含功能說明、主要功能列表、存取權限說明
  - 點擊模組標題可直接跳轉至對應功能
- Sidebar「其他」區塊新增「說明文件」連結
- 手機版 BottomNav「更多」面板新增「說明文件」

### Fixed
- BottomNav 語言切換補上 DB 同步（與 Sidebar 行為一致）
- Cookie 補上 `secure: true`（`/api/locale` 與 `/api/auth/callback`）
- `LANGUAGES` 常數統一定義於 `src/i18n/config.ts`，Sidebar / BottomNav / LoginControls / Quick-Start 全部 import
- Quick-Start 頁面：`LOCALE_COOKIE` 改 import from config，不再 hardcode

## [0.2.24] - 2026-04-05

### Added
- 登入頁右上角新增語言切換 + Dark/Light 主題切換（`LoginControls` client component）
- 新增 Quick Start 指南頁面 `/quick-start`（三語言，zh-TW/en/ja 內容完整）
  - 6 步驟說明：開啟系統 → 登入 → Microsoft 驗證 → MFA 設定 → MFA 驗證 → 完成
  - 頁面內語言切換（無需登入）
  - 推薦驗證器 App 說明（Google/Microsoft Authenticator）
- 登入頁底部新增「Quick Start 指南」連結
- `/quick-start` 加入公開路由（不需登入可存取）

### Fixed
- 英文 projects 頁面：`memberCount`/`totalRecords` 改用 ICU plural 格式（"1 member" 而非 "1 members"）

## [0.2.22] - 2026-04-05

### Fixed
- Contracts 表格欄位標題：`contracts.title`（頁面標題）改用獨立 `contracts.nameColumn` key
- DocumentsClient：DB 動態值 `doc_type`/`folder` 改用 guard check，避免 unknown key 觸發 next-intl 報錯
- DocumentDetailClient：audit log `action` 改用 guard check，不在 catalog 內的值 fallback 回原始字串

## [0.2.21] - 2026-04-05

### Fixed
- Projects 頁面補上 i18n：ProjectsClient、ProjectDetail 全部接上 useTranslations()
- 新增 projects 翻譯 key（41 個），三語同步（721 key 總計）

## [0.2.20] - 2026-04-05

### Added
- 深度 i18n 補完：所有剩餘硬編碼中文字串替換為翻譯 key
  - Contracts（合約類型/狀態篩選/到期警告/操作按鈕）
  - Documents（上傳表單/詳情/分類/狀態）
  - Overtime（申請表單/狀態/計算說明）
  - Leave（申請/審核/類型標籤）
  - Payroll（薪資明細/anomalies/年度報告）
  - Feedback（回饋表單）
  - StatusBadge（通用狀態標籤多語系）
  - Admin（settings/users/leave-types/overtime-rates/attendance-anomalies）
- 三語 JSON 全面同步（686 key，zh-TW/en/ja 完全對齊）

## [0.2.19] - 2026-04-05

### Added
- 全站 i18n 接入：39 個 component 全部接上 useTranslations()/getTranslations()
  - Sidebar、BottomNav、Dashboard、Login、MFA setup/verify
  - Settings（主題/語言/MFA）
  - Attendance（打卡/補打卡/團隊總覽）、Leave calendar
  - Announcements（分類標籤/確認狀態）、Contracts、Documents
  - Overtime、Payroll（含 anomalies）、Projects、Feedback
  - StatusBadge（通用狀態標籤）
  - 所有 Admin 頁面（users/departments/companies/leave-types/leave-balances/overtime-rates/insurance-brackets/bonuses/feedback/audit/attendance/settings）
- 三語 JSON 完全同步（zh-TW/en/ja 共 367 key，0 缺漏）

## [0.2.18] - 2026-04-05

### Fixed
- **語言切換根本修復**：所有 component 接上 `useTranslations()` / `getTranslations()`
  - Sidebar：所有導航標籤、section header、aria-label 使用翻譯 key
  - BottomNav：所有導航標籤、theme label、logout 使用翻譯 key
  - Login page：按鈕文字、說明文字使用翻譯 key
  - Dashboard：歡迎訊息、待辦事項、快速入口使用翻譯 key
- 新增翻譯 key：`nav.more`、`nav.themeLight`、`nav.themeDark`（三語言）

## [0.2.17] - 2026-04-05

### Fixed
- 語言切換改用 GET redirect：`/api/locale?lang=en&redirect=/` → server 設 cookie + 302 回原頁
- 最可靠的 cookie 設定方式：瀏覽器處理 Set-Cookie + redirect，不依賴 fetch 或 document.cookie

## [0.2.16] - 2026-04-05

### Fixed
- 語言切換改用 `document.cookie` 直接設定（跟 EDC 完全一樣），不經 API route，不受 middleware 影響

## [0.2.15] - 2026-04-05

### Fixed
- Sidebar 語言切換改回 `window.location.reload()`（`router.refresh()` 不會重新載入 root layout 的 NextIntlClientProvider）

## [0.2.14] - 2026-04-04

### Fixed
- **語言切換根本原因修復**：`/api/locale` 被 proxy.ts middleware 攔截 → 307 redirect to /login，cookie 從未設上。已加入 publicRoutes bypass。

## [0.2.13] - 2026-04-04

### Fixed
- React hydration error #418：useTheme() SSR/client mismatch，加 mounted guard

## [0.2.12] - 2026-04-04

### Fixed
- 語言切換 API 簡化：`/api/locale` 只設 cookie（不動 DB、不需 auth），完全對齊 mycrm
- DB 語言儲存改為 fire-and-forget，不阻塞 cookie 設定

## [0.2.11] - 2026-04-04

### Fixed
- 語言切換重構：對齊 mycrm 的做法
  - Cookie 名改為 `MYOPS_LOCALE`（避免 generic `locale` 衝突）
  - 移除 `Secure` flag（mycrm/EDC 都沒用，會在 HTTP 環境失效）
  - Sidebar 改用 `router.refresh()` 取代 `window.location.reload()`
  - 新增 `src/i18n/config.ts` 統一管理 cookie 名、支援語言、預設值

## [0.2.10] - 2026-04-04

### Fixed
- 語言切換改用 server-side API route（`/api/locale`）設定 cookie，取代不可靠的 `document.cookie`
- 所有語言切換入口統一走同一個 API：Sidebar、BottomNav、Settings、LocaleSync

## [0.2.9] - 2026-04-04

### Added
- Desktop Sidebar: 使用者資訊旁新增登出按鈕（hover 變紅），collapsed 狀態也有 icon
- Mobile BottomNav「更多」面板底部新增「登出」按鈕（紅色文字）

## [0.2.7] - 2026-04-04

### Fixed
- 系統設定頁：key 名稱對齊 DB seed data，加入 catch-all 群組，移除不存在的 description 欄位
- 語言切換：auth callback 登入時同步 locale cookie，避免多餘的 reload
- 所有 locale cookie 統一加 Secure flag（HTTPS 環境）

## [0.2.6] - 2026-04-04

### Fixed
- Leave calendar 月份切換：API 新增 `start/end/calendar` 參數支援，修正切月後資料錯誤
- 公告語言解析：`resolveContent` 正確處理 `zh-TW` → `zh` 對應
- Daily digest 公告計數：加入 `requires_confirmation=true` + `confirmed_at IS NULL` 過濾

## [0.2.5] - 2026-04-04

### Fixed
- 網頁版語言切換：改用 `useLocale()` 判斷當前語言，修正高亮不同步問題

### Added
- 手機版「更多」面板新增 Dark/Light mode 切換按鈕
- 手機版「更多」面板新增語言切換（中文/EN/日本語）

## [0.1.0-alpha.1] - 2026-04-03

### Added
- Initial Next.js 14 project setup (TypeScript, Tailwind CSS, App Router)
- shadcn/ui component library initialized
- Core packages: Supabase SSR, next-intl, next-themes, react-hook-form, zod, sonner, lucide-react
- Supabase client (server + browser)
- Middleware with AAL MFA enforcement
- i18n setup (zh-TW / en / ja)
- Type definitions and hasFeature utility
