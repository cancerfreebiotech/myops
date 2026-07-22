-- ============================================================
-- FIX (P0): daily_report_groups was given a `set_updated_at` BEFORE UPDATE
-- trigger (see 20260618000012_daily_report.sql) but the table never had an
-- `updated_at` column. Every UPDATE therefore raised 42703 (undefined column),
-- so PATCH / DELETE (soft-delete via UPDATE deleted_at) on groups all 500'd.
-- INSERT was unaffected. Adding the column makes the trigger's
-- `NEW.updated_at = NOW()` assignment valid and unblocks all UPDATEs.
-- ============================================================
ALTER TABLE daily_report_groups
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- Atomic member replacement for a group in ONE function transaction.
--
-- WHY: the PATCH route replaces members with two separate PostgREST calls
-- (DELETE all members → INSERT new set). PostgREST has no cross-call
-- transaction, so a failure between them leaves a group with its members
-- wiped and none re-added. This RPC does delete+insert atomically.
--
-- SECURITY: SECURITY INVOKER — runs as the calling user, so the existing
-- `is_admin()` RLS policy on daily_report_group_members (FOR ALL) gates every
-- DELETE/INSERT. It is invoked through the RLS-active createServiceClient()
-- (user JWT), so is_admin() resolves correctly. EXECUTE granted to
-- authenticated; RLS is the real gate.
-- ============================================================
CREATE OR REPLACE FUNCTION dr_replace_group_members(p_group_id uuid, p_members jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_member jsonb;
BEGIN
  DELETE FROM daily_report_group_members WHERE group_id = p_group_id;

  IF jsonb_array_length(COALESCE(p_members, '[]'::jsonb)) > 0 THEN
    FOR v_member IN SELECT * FROM jsonb_array_elements(p_members) LOOP
      INSERT INTO daily_report_group_members (group_id, user_id, role)
      VALUES (
        p_group_id,
        (v_member->>'user_id')::uuid,
        COALESCE(v_member->>'role', 'member')  -- CHECK (role IN ('member','viewer')) enforces validity
      );
    END LOOP;
  END IF;
END $$;

REVOKE ALL ON FUNCTION dr_replace_group_members(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dr_replace_group_members(uuid, jsonb) TO authenticated;
