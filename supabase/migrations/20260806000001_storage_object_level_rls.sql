-- ============================================================
-- Storage RLS：補上 5 個 bucket 的物件層授權（object-level authorization）
-- ============================================================
-- 背景：2026-07-23 commit 43fc350「修好」storage IDOR，實際上只補了
-- /api/storage/download 這個 app 層 proxy（加 bucket allowlist + 用來源表的
-- RLS 當物件層授權），完全沒有動到 storage.objects 本身的 RLS。但
-- storage.objects 的 SELECT 政策同時管控 list 與 download 兩種操作，而
-- Supabase 的 anon key + 使用者 JWT 本來就在瀏覽器端——任何登入者可以完全跳過
-- /api/storage/download，直接對 Supabase Storage REST API 打 list/download。
-- documents / feedback-screenshots / expense-receipts / leave-files /
-- training-files 這 5 個 bucket 的 SELECT 政策目前只檢查 bucket_id，沒有檢查
-- 呼叫者是否真的看得到引用該路徑的來源列。
--
-- 修法：把每個 bucket 的 SELECT 政策改成「bucket_id 對，且存在一列來源表資料
-- 引用這個路徑、而且呼叫者依該表既有的 RLS 條件看得到那一列」——EXISTS 子查詢
-- 裡的條件直接照抄各表現有的 SELECT policy（見 /api/storage/download 的
-- BUCKET_RESOLVERS 表，那裡列了每個 bucket 對應哪張表哪個欄位）。
--
-- asset-files 刻意不動：來源表 asset_logs 的 SELECT RLS 本身是
-- USING (true)（全員可讀，設計上就是公司共用的資產進出記錄，非個資），
-- bucket 維持同樣寬度沒有製造新風險，故不在此次範圍內。
--
-- INSERT（上傳）政策不動：使用者是先上傳檔案拿到路徑、再把路徑寫回主表，
-- 上傳當下主表列還不存在，若把 INSERT 也收緊成「主表已有引用」會讓上傳本身
-- 失敗。上傳不會洩漏他人資料，風險只在「讀」，所以只收緊 SELECT。
-- ============================================================

-- documents ---------------------------------------------------------------
DROP POLICY IF EXISTS "documents bucket: authenticated can read via signed url" ON storage.objects;
CREATE POLICY "documents bucket: owner/dept/admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents' AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM documents d
        WHERE d.file_url = storage.objects.name
          AND d.deleted_at IS NULL
          AND (
            d.folder = 'shared'
            OR d.uploaded_by = auth.uid()
            OR d.owner_id = auth.uid()
            OR is_admin()
            OR (d.folder = 'internal' AND d.department_id = (SELECT department_id FROM users WHERE id = auth.uid()))
            OR has_feature('approve_contract')
          )
      )
    )
  );

-- feedback-screenshots ------------------------------------------------------
DROP POLICY IF EXISTS "feedback-screenshots bucket: authenticated can read" ON storage.objects;
CREATE POLICY "feedback-screenshots bucket: owner/admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'feedback-screenshots' AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM feedback f
        WHERE f.screenshot_urls @> ARRAY[storage.objects.name]
          AND (f.submitted_by = auth.uid() OR is_admin())
      )
    )
  );

-- expense-receipts ------------------------------------------------------
DROP POLICY IF EXISTS "expense-receipts bucket: authenticated can read" ON storage.objects;
CREATE POLICY "expense-receipts bucket: owner/approver/admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts' AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM expense_claims e
        WHERE e.receipt_paths @> ARRAY[storage.objects.name]
          AND (e.user_id = auth.uid() OR is_admin() OR has_feature('expense_approve'))
      )
    )
  );

-- leave-files ------------------------------------------------------
DROP POLICY IF EXISTS "leave-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "leave-files bucket: owner/hr/admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'leave-files' AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM leave_qualification_requests r
        WHERE r.attachments @> ARRAY[storage.objects.name]
          AND (r.user_id = auth.uid() OR is_admin() OR has_feature('hr_manager'))
      )
    )
  );

-- training-files ------------------------------------------------------
DROP POLICY IF EXISTS "training-files bucket: authenticated can read" ON storage.objects;
CREATE POLICY "training-files bucket: owner/admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-files' AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM training_records tr
        WHERE tr.attachment_paths @> ARRAY[storage.objects.name]
          AND (tr.user_id = auth.uid() OR is_admin() OR has_feature('training_manage'))
      )
      OR EXISTS (
        SELECT 1 FROM certifications c
        WHERE c.attachment_paths @> ARRAY[storage.objects.name]
          AND c.deleted_at IS NULL
          AND (c.user_id = auth.uid() OR is_admin() OR has_feature('training_manage'))
      )
    )
  );
