-- T9: 特殊假別需先經人資核給資格（MVP）
--
-- 婚假、喪假、產假、產檢假、陪產檢假、陪產假、安胎假、育嬰留職停薪等特殊假別，
-- 員工不可直接申請：需 HR 先確認資格（證明文件）後，透過既有的假別餘額管理頁
-- 核給天數（＝資格核可，寫入 leave_balances），員工才可送出申請。
--
-- 設計（已拍板）：leave_types 加 requires_qualification 旗標；請假建立
-- （POST /api/leave/requests）時若該假別 requires_qualification=true，
-- 用既有 period-aware 邏輯（pickBalanceForDate）查該員工該假別的餘額列，
-- 無餘額列或 total_days<=0 即擋下。不做線上資格申請流程（未來再說）。

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS requires_qualification BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN leave_types.requires_qualification IS
  'true = 特殊假別：員工需先經 HR 審核資格（HR 於假別餘額管理頁核給天數＝資格核可，leave_balances 有額度列且 total_days > 0）才可申請。';

-- 既有特殊假別補旗標（條件 UPDATE，可重複執行）
UPDATE leave_types
SET requires_qualification = TRUE
WHERE name_zh IN ('婚假', '喪假', '產假', '陪產假')
  AND requires_qualification = FALSE;

-- 補齊缺少的特殊假別（比對 name_zh，可重複執行）。
-- 額度天數依台灣勞動法規慣例：產檢假 7 日全薪、陪產檢假 7 日全薪（與陪產假合計）；
-- 安胎假／育嬰留職停薪天數視個案由 HR 核給（default_quota_days 留 NULL），
-- 安胎假比照病假半薪、育嬰留職停薪無薪且需提前 10 日申請。
INSERT INTO leave_types (name_zh, name_en, name_ja, applicable_to, salary_ratio, advance_days, quota_type, default_quota_days, sort_order, is_active, requires_qualification)
SELECT '產檢假', 'Prenatal Checkup Leave', '妊婦健診休暇', 'full_time', 1.0, 0, 'fixed', 7, 10, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE name_zh = '產檢假');

INSERT INTO leave_types (name_zh, name_en, name_ja, applicable_to, salary_ratio, advance_days, quota_type, default_quota_days, sort_order, is_active, requires_qualification)
SELECT '陪產檢假', 'Paternity Checkup Leave', '配偶者妊婦健診休暇', 'full_time', 1.0, 0, 'fixed', 7, 11, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE name_zh = '陪產檢假');

INSERT INTO leave_types (name_zh, name_en, name_ja, applicable_to, salary_ratio, advance_days, quota_type, default_quota_days, sort_order, is_active, requires_qualification)
SELECT '安胎假', 'Pregnancy Bed Rest Leave', '妊娠安静休暇', 'full_time', 0.5, 0, 'fixed', NULL, 12, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE name_zh = '安胎假');

INSERT INTO leave_types (name_zh, name_en, name_ja, applicable_to, salary_ratio, advance_days, quota_type, default_quota_days, sort_order, is_active, requires_qualification)
SELECT '育嬰留職停薪', 'Parental Leave (Unpaid)', '育児休業', 'full_time', 0.0, 10, 'fixed', NULL, 13, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE name_zh = '育嬰留職停薪');
