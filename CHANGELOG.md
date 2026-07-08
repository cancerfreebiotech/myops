# Changelog

All notable changes to this project will be documented in this file.

## v0.7.7 — AI 供應商通用設定（2026-07-08）

### Changed
- **AI 設定不再綁定 Gemini**：系統設定新增「AI 供應商」（openai / anthropic / gemini）、「AI API Key」、「AI API 端點」（選填，支援 OpenAI 相容端點如 Groq / Ollama / LiteLLM / 自架 proxy）、「AI 模型」（選填，未設用供應商預設）。AI 翻譯與 AI 政策問答皆改走此設定
- 舊的 Gemini API Key 設定保留、向下相容（新 Key 未設時自動沿用）

### Notes
- AI 功能（翻譯／政策問答／OCR）程式碼皆已完成，啟用只需在系統設定填入對應的 Key／端點

## v0.7.6 — 加班費依勞基法分段計算（2026-07-08）

### Added
- **加班日別**：加班申請新增「加班日別」（工作日／休息日／國定假日），選日期時自動判斷（週六日＝休息日），國定假日手動選擇；申請列表顯示日別
- **勞基法分段計薪**：薪資計算的加班費改依勞基法 §24/§39 分段——工作日前 2 小時 ×1.34、後 2 小時 ×1.67；休息日前 2 小時 ×1.34、第 3–8 小時 ×1.67、第 9 小時起 ×2.67；國定假日 ×2。倍率仍可由管理員在加班費率設定中調整

### Fixed
- **加班費先前一律以 1.34 倍計算**：因加班單未記錄費率，所有加班（含休息日後段、國定假日）都被以最低倍率計薪，現已修正；歷史加班單已回填日別（週六日＝休息日），已發薪月份不重算
- **HR 設定頁**：假別清單、假期餘額的假別下拉、加班費率清單先前因欄位問題永遠空白，已修復

### Changed
- **加班費率設定頁**：移除無作用的「啟用」開關（費率為法定分段，只可調倍率不可停用）；費率名稱依介面語言顯示

### Notes
- 例假日出勤屬天災事變特殊情況（勞基法 §40，加倍發給＋補假），不納入系統自動計算，如遇到請人工處理

## v0.7.5 — 全面品質掃修 / 選單排序 / 說明文件改版（2026-07-08）

### Fixed（全站 13 個面向的地毯式審查，43 項確認問題全數修復或列管）
- **意見回饋**：送出必定失敗的問題已修復（欄位與類別值對齊資料庫），管理端狀態流也一併修正
- **請假**：假別清單載入失敗、假期餘額顯示錯誤已修復；主管／HR 現在能正確看到待審假單；特休等年資制假別的餘額上限檢查補齊（申請與核准兩端）
- **加班**：跨午夜加班不再算成 0 小時（畫面預覽同步修正）；加班單現在會正確出現在簽核中心與營運儀表板
- **出勤**：管理端出勤總覽不再一片空白；補打卡的時間不再差 8 小時；HR 主管可正常進入出勤管理與班別管理頁
- **薪資**：管理員手動建立薪資記錄失敗的問題已修復
- **簽核防護**：報帳、文件／合約、績效考核全面加上「不可核准自己的申請」防護（與請假／加班／出差一致）
- **公告／文件**：hr_manager 發布公告被系統擋下的問題已修復；催讀 4 小時冷卻可被繞過的漏洞已補；所有稽核記錄（上傳／核准／翻譯／確認閱讀／催讀／採購簽核）先前寫入靜默失敗，現在會確實留痕
- **Outlook 同步**：請假／出差核准後的行事曆事件先前一律建立失敗（全天事件格式錯誤），已修復
- **假別／加班費率管理**：新增、編輯、清單顯示全面修復（先前儲存必失敗、清單永遠空白）
- **採購**：多位審核者同時核准可能重複執行後續動作的併發問題已修復；驗收單重複轉入庫、轉單帶入超量的問題已修復；請購單的進貨進度現在會隨入庫過帳正確更新
- **資產**：同一張驗收單可被重複轉成資產的問題已修復
- **每日報告**：切換日期偶發顯示錯誤日期資料、KPI 輸入競態、已刪除群組成員仍看到建立任務按鈕等問題修復
- **儀表板**：待審請假／加班計數永遠為 0 的問題已修復；加班卡片標籤誤植「待審合約」已更正
- **介面文字**：補齊缺漏的翻譯（績效週期刪除提示、使用者權限開關標籤），三語同步

### Changed
- **左側選單重新排序**：人事管理（每天用的打卡／請假）移到文件管理之前，區內依使用頻率排序；管理後台選單依領域分組（組織 → 出勤 → 財務／營運 → 系統）；手機版「更多」選單同步調整
- **說明文件（/help）全面改版**：涵蓋全部 24 個功能模組（新增簽核中心、行事曆、每日報告、出差、報帳、教育訓練、績效、採購、資產、試劑耗材、營運儀表板等條目），權限矩陣擴充至 13 區 46 列，三語內容同步更新

### Notes
- 一支資料庫補強 migration（資產轉入防護）已備妥待授權後套用；「加班倍率自動計算」需資料表調整，已列入 roadmap 待決事項

### Added
- **文件 OCR 全文搜尋**：純檔案（掃描 PDF / 圖片）文件可由文件管理者一鍵 OCR 抽取文字，之後可在文件搜尋中被找到，AI 政策問答也能引用；OCR 服務端點由管理員在系統設定中配置
- **彈性工時班別**：管理員可定義多種班別（上下班時間、工作日、彈性寬限）並指派給員工；打卡遲到改以員工當日班別的上班時間判定（未指派者沿用預設上班時間）
- **打卡地理圍欄**：管理員可設定允許打卡的辦公室範圍（可多個地點），開啟「強制範圍檢查」後，超出所有範圍將無法打卡；預設關閉（僅記錄座標不阻擋）

### Notes
- OCR 需管理員先在系統設定填入 OCR 服務端點；地理圍欄強制預設為關閉，需管理員手動開啟

## v0.6.9 — Outlook 行事曆同步（2026-07-07）

### Added
- **請假 / 出差自動同步至 Outlook**：請假或出差經核准後，系統會自動在當事人的 Outlook 行事曆建立整天「不在辦公室」事件；退回則自動移除。單向同步（Outlook 端的變更不會回寫 myOPS），使用各自的 Microsoft 帳號授權。

### Notes
- 首次啟用需**重新登入一次** myOPS（以授權行事曆存取）；未連結者核准流程不受影響，只是不會建立 Outlook 事件

## v0.6.7 — 合約/公告流程強化與資產轉入（2026-07-07）

### Added
- **合約到期自動提醒**：合約（含 NDA/MOU/增補）到期前 90 天與 30 天，系統自動透過 Teams 提醒具合約審核權限的同仁
- **合約審核通知**：合約核准或退回後，自動通知申請人結果；合約類文件另會知會營運長
- **上傳合約時關聯提示**：選定公司後若該公司已有文件，可一鍵關聯既有文件
- **公告一鍵催人**：發布者可在報表對尚未確認的同仁一鍵發送 Teams 提醒（附冷卻避免重複打擾）
- **公告簽署清單匯出**：發布者可將某公告的閱讀確認清單匯出成 Excel
- **公告提醒頻率**：每日提醒改依各公告設定的提醒間隔（reminder_days），不再每天重複提醒
- **專案加班超額通知**：專案加班時數超過設定門檻時，自動通知營運長
- **採購驗收單一鍵轉資產**：已核准的進貨驗收單可直接轉為資產，自動帶入廠商 / 金額 / 日期

### Fixed
- **公告閱讀確認**：修正「發布公告並指定需確認收件人 / 確認閱讀 / 每日提醒」因資料表欄位缺漏而無法運作的問題

## v0.6.4 — 稽核修復與行事曆隱私（2026-07-06）

### Fixed
- **請假 / 加班送出**：修正送出申請因欄位名稱與資料庫不符而一直失敗的問題（此前無法成功建立任何請假或加班申請）
- **加班列表 / 待審清單**：修正因查詢不存在欄位而載入失敗

### Security
- **行事曆隱私**：修正任何員工可讀取他人請假事由 / 附件 / 出差行程的問題；行事曆改為只顯示必要資訊（姓名、日期、假別），請假行事曆一般員工僅見同部門
- **採購作廢**：作廢已核准單據改為限採購管理者 / 管理員，並需 MFA（原本唯讀權限即可作廢並回沖庫存）
- **驗收單編輯**：補上建檔人 / 管理者所有權檢查（原本任何採購人員可改他人草稿並自任簽核人）
- **薪資簽核**：核准動作驗證目前階段，不可跳關或倒退
- **補打卡**：核准人改以主管關係認定、不可核准自己的申請、申請人無法自行指定核准人

### Fixed（時區）
- 打卡日期、打卡提醒、資產 / 證照到期提醒改以台北時區計算，凌晨時段不再差一天

## v0.6.2 — 全站安全稽核修復（2026-07-05）

### Security
- **權限提升漏洞（重大）**：修正任何登入者可透過 API 直接把自己的角色改為管理員 / 加開權限的問題（users 資料表 self-update 未限制敏感欄位）
- **自我核准漏洞**：修正申請人可繞過主管、自行核准自己的請假 / 加班單；文件（合約）核准補上 MFA 驗證，並限定僅具審核權限者可變更文件狀態
- **報帳 / 出差取消失效**：修正一般員工無法取消自己待審申請（RLS 缺 WITH CHECK 導致必定失敗）
- **履歷外洩**：招募履歷檔案改為僅 HR / 管理員可存取（原本任何登入者皆可下載）

### Fixed
- **請假相關查詢**：修正請假列表 / 簽核中心 / 行事曆因查詢不存在的欄位而失敗的問題
- **試劑耗材庫存**：批次異動改為單一交易的原子操作，避免併發時數量錯亂、超領、或紀錄與庫存不一致
- **營運儀表板**：近 6 個月統計改以台北時區計算，月初不再整組偏移
- **報帳差旅串接**：送出報帳時驗證所選出差單屬本人且已核准
- 訓練時數、證照、資產軟刪除等權限收緊

## v0.6.1 — 績效考核（2026-07-05）

### Added
- **績效考核**：新頁面 `/performance` — HR 建立考核週期；員工設定目標（權重合計 100%）→ 主管核定或退回 → 員工逐目標自評（1–5 分）→ 主管逐目標評分與總評（需 MFA）→ 完成鎖定結果；完成時自動存入該期間的每日報告 KPI 快照（目標 vs 實績）供對照；HR 可檢視全公司進度並重新開啟已完成考核
- UAT 清單 v1.3：新增第 28 章績效考核測試（T-105 ~ T-112，共 112 項）

### Notes
- feature flag `performance` 預設關閉；DB migration（`20260704000004`）待另行執行後才可開啟

## v0.6.0 — 招募管理 + 試劑/耗材管理（2026-07-04）

### Added
- **招募管理**（HR/管理員限定）：新頁面 `/admin/recruiting` — 職缺管理、應徵者追蹤（投遞→書審→面試→Offer→錄取/未錄取）、履歷上傳、面試評分與回饋記錄
- **試劑/耗材管理**：新頁面 `/lab` — 試劑與耗材品項、批次管理（批號＋效期）、使用/開封/報廢異動記錄、低庫存與效期到期提醒；全員可查閱庫存，具「試劑耗材管理」權限者可異動

## v0.5.9 — 入職/離職流程（2026-07-04）

### Added
- **入職/離職流程**（HR/管理員限定）：新頁面 `/admin/lifecycle` — 為新進或離職員工建立流程清單（入職 10 項/離職 8 項預設範本：帳號、設備、權限、交接、人資），逐項勾選追蹤（記錄完成人與時間）、可加自訂項目與備註、完成後結案

## v0.5.8 — AI 政策問答（2026-07-03）

### Added
- **AI 政策問答**：說明頁（/help）新增問答框 — 用自然語言詢問公司規定（如「特休怎麼計算」），AI 根據已發布的公司文件回答並附出處；文件中沒有的內容會明說並建議洽詢 HR
- **Teams bot 升級**：對 bot 提問不在既有指令範圍的問題時，自動以文件庫為根據回答

## v0.5.7 — 營運儀表板（2026-07-03）

### Added
- **營運儀表板**（管理員限定）：新頁面 `/insights` — 本月出勤與加班摘要、年度請假與報帳合計，以及近 6 個月加班時數、出勤人日、請購金額趨勢與請假假別/報帳類別/專案加班分布圖

## v0.5.6 — 公司行事曆（2026-07-03）

### Added
- **公司行事曆**：新頁面 `/calendar` — 一頁月曆彙總公司活動（綠）、已核准請假（藍）、已核准出差（紫）；點日期看當日完整清單；HR/管理員可建立與管理公司活動；手機版最佳化

## v0.5.5 — 出差管理（2026-07-03）

### Added
- **出差管理**：新頁面 `/business-trips` — 出差申請（目的地、事由、行程）→ 主管審批；申請人可取消待審核申請
- **簽核中心整合**：出差申請納入 `/approvals` 一鍵核准/退回
- **差旅報帳串接**：已核准出差一鍵帶入報帳表單（類別與事由自動預填），報帳記錄顯示關聯出差

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
