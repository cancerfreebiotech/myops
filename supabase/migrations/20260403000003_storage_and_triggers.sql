-- ============================================================
-- myOPS v0.1 — Storage Buckets & Triggers
-- ============================================================

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', FALSE, 52428800, NULL),
  ('feedback-screenshots', 'feedback-screenshots', FALSE, 10485760, ARRAY['image/jpeg','image/png','image/gif','image/webp']),
  ('insurance-brackets', 'insurance-brackets', FALSE, 10485760, ARRAY['application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "documents bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents bucket: authenticated can read via signed url"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "feedback-screenshots bucket: authenticated can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback-screenshots');

CREATE POLICY "feedback-screenshots bucket: authenticated can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-screenshots');

CREATE POLICY "insurance-brackets bucket: finance/admin can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'insurance-brackets' AND (
      has_feature('finance_payroll') OR is_admin()
    )
  );

CREATE POLICY "insurance-brackets bucket: finance/admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'insurance-brackets' AND (
      has_feature('finance_payroll') OR has_feature('hr_manager') OR is_admin()
    )
  );

-- ────────────────────────────────────────────────────────────
-- AUTO-CREATE user record on auth.users insert
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────
-- UPDATE last_login_at on sign-in
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_user_login()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users
  SET last_login_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_login();
