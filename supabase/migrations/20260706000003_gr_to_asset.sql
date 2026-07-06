-- ============================================================
-- myOPS — 採購驗收單（GR）一鍵轉資產（TODO backlog）
-- assets.source_gr_id 已存在；此處提供「已核准 GR」給資產管理者選用與驗證，
-- 讓資產管理者不需具備採購模組讀取權限也能轉入。
-- ============================================================

-- 已核准的進貨驗收單（供轉資產選用）；限 admin / asset_manage 呼叫
CREATE OR REPLACE FUNCTION approved_grs_for_asset()
RETURNS TABLE (id UUID, doc_no TEXT, vendor_name TEXT, total_amount NUMERIC, purchase_date DATE)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_admin() OR has_feature('asset_manage')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT gr.id, gr.doc_no, gr.vendor_name, gr.total_amount,
         COALESCE(gr.inspected_at::date, gr.received_at::date)
  FROM goods_receipts gr
  WHERE gr.status = 'approved'
  ORDER BY COALESCE(gr.inspected_at, gr.received_at, gr.created_at) DESC;
END;
$$;

-- 純量：GR 是否為「已核准」（供 POST /api/assets 驗證 source_gr_id）
CREATE OR REPLACE FUNCTION gr_is_convertible(p_gr_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM goods_receipts WHERE id = p_gr_id AND status = 'approved')
$$;

GRANT EXECUTE ON FUNCTION approved_grs_for_asset() TO authenticated;
GRANT EXECUTE ON FUNCTION gr_is_convertible(UUID) TO authenticated;
