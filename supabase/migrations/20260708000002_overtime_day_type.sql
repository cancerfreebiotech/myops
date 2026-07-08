-- ============================================================
-- myOPS — 加班倍率落地（勞基法 §24 分段計薪）
-- 1) overtime_requests.day_type：加班日別（工作日/休息日/國定假日）。
--    request_type（regular/project）管「是否掛專案」，與日別正交，維持不動。
--    例假日出勤屬天災事變特殊情況（勞基法 §40，加倍發給＋補假），不納入系統自動計算。
-- 2) 回填：週六日 → rest_day；歷史國定假日無資料來源維持 weekday（已發薪月份不重算）。
-- 3) overtime_rates.tier_key：給計薪分段用的穩定鍵（依 sort_order 一次性對應，
--    之後計薪依 tier_key 讀倍率，管理員改名/改倍率都不影響對應）。
-- ============================================================

ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS day_type TEXT NOT NULL DEFAULT 'weekday'
  CHECK (day_type IN ('weekday', 'rest_day', 'holiday'));

UPDATE overtime_requests SET day_type = 'rest_day' WHERE EXTRACT(ISODOW FROM ot_date) IN (6, 7);

ALTER TABLE overtime_rates ADD COLUMN IF NOT EXISTS tier_key TEXT UNIQUE;

UPDATE overtime_rates SET tier_key = CASE sort_order
  WHEN 1 THEN 'weekday_1'  -- 平日 前2小時 ×1.34（勞基法 §24-1）
  WHEN 2 THEN 'weekday_2'  -- 平日 後2小時 ×1.67
  WHEN 3 THEN 'rest_1'     -- 休息日 前2小時 ×1.34（§24-2）
  WHEN 4 THEN 'rest_2'     -- 休息日 2-8小時 ×1.67
  WHEN 5 THEN 'rest_3'     -- 休息日 8小時以上 ×2.67
  WHEN 6 THEN 'holiday'    -- 國定假日 ×2（§39 加倍發給）
END
WHERE tier_key IS NULL;
