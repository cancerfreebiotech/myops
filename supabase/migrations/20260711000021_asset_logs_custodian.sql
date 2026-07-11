-- ============================================================
-- myOPS — 資產 checkout/checkin 記錄借用人
-- asset_logs 原本只有 performed_by(TEXT) 與 user_id(操作者)，
-- checkout/checkin 的借用人(custodian_id) 僅同步到 assets.custodian_id，
-- 未保存在 log 中，導致歷史記錄無法追溯當下借用人。
-- 新增 custodian_id 欄位保存借用人 id。
-- ============================================================

ALTER TABLE asset_logs
  ADD COLUMN IF NOT EXISTS custodian_id UUID REFERENCES users(id);
