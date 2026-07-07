-- ============================================================
-- myOPS — 資產模組安全補強（本檔尚未套用到正式 DB，需明確授權後執行）
-- 1) gr_is_convertible()：SECURITY DEFINER 但缺授權檢查，任何登入者可探測 GR 狀態。
--    補上與 approved_grs_for_asset() 相同的 is_admin()/has_feature('asset_manage') 檢查，
--    並依慣例釘住 search_path。
-- 2) assets.source_gr_id 部分唯一索引：API 層已加防重（app 檢查），此索引補上
--    DB 層保證，關閉同一 GR 併發重複轉資產的 TOCTOU 空窗。
-- ============================================================

CREATE OR REPLACE FUNCTION gr_is_convertible(p_gr_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin() OR has_feature('asset_manage')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN EXISTS (SELECT 1 FROM goods_receipts WHERE id = p_gr_id AND status = 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION gr_is_convertible(UUID) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_source_gr_id
  ON assets(source_gr_id) WHERE source_gr_id IS NOT NULL AND deleted_at IS NULL;
