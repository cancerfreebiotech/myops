-- 請採購單依金額決定簽核關卡（Linda 7/29 回報 acefefa5）
--
-- 需求：一般只需部門主管；金額 > 3,000 加營運長；> 20,000 再加執行長。
-- 現況 255 張單裡 96 張（38%）在 3,000 以下，卻一律走 4 關。
--
-- 設計方向與原因：
-- 1. 加 step_name 欄位。原本關卡名稱不存在資料庫裡，畫面是用「第幾關」去 APPROVAL_FLOWS
--    的固定陣列取第 N 個（ApprovalTimeline 的 flow[step_no - 1]）。一旦關卡數會隨金額變動，
--    這種「用位置數」的做法就會標錯名稱——小額單的第 2 關實際是「通知採購」，卻會顯示成
--    「COO」。所以把送簽當下決定的關卡名稱（i18n key，不是翻譯後的字）寫進該列，
--    畫面直接讀它。舊資料 step_name 為 NULL，畫面自動退回原本的位置推導，行為不變。
-- 2. 門檻放 system_settings 而非寫死在程式：金額門檻是會隨公司規模調整的營運政策，
--    走既有的 COO 設定頁（/admin/coo-settings）就能改，不必重新部署。
--    讀不到或值不合法時，程式端 fallback 回這裡的預設值（3000 / 20000）。
-- 3. 只影響「之後才送簽」的單。已在簽核中的 2 張單其關卡列已經寫好，不回頭改，
--    避免動到進行中的簽核狀態。

ALTER TABLE procurement_approval_steps
  ADD COLUMN IF NOT EXISTS step_name TEXT;

COMMENT ON COLUMN procurement_approval_steps.step_name IS
  '關卡名稱的 i18n key（procurement.approval.steps.*），送簽時由 APPROVAL_FLOWS 寫入；NULL＝舊資料，畫面退回以 step_no 推導';

-- 門檻預設值（不覆寫已存在的設定）
INSERT INTO system_settings (key, value)
VALUES
  ('pr_approval_coo_threshold', '3000'),
  ('pr_approval_ceo_threshold', '20000')
ON CONFLICT (key) DO NOTHING;
