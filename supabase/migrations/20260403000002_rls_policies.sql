-- ============================================================
-- myOPS v0.1 — RLS Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_insurance_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_insurance_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_features()
RETURNS TEXT[] LANGUAGE sql STABLE AS $$
  SELECT granted_features FROM users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT role = 'admin' FROM users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION has_feature(feature TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT role = 'admin' OR feature = ANY(granted_features)
  FROM users WHERE id = auth.uid()
$$;

-- ────────────────────────────────────────────────────────────
-- DEPARTMENTS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "departments: all authenticated can read"
  ON departments FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "departments: admin can write"
  ON departments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "users: authenticated can read active users"
  ON users FOR SELECT TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "users: self can update own non-sensitive fields"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users: admin can do everything"
  ON users FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────────
-- USER PROFILES
-- ────────────────────────────────────────────────────────────
CREATE POLICY "user_profiles: self can read own"
  ON user_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_profiles: hr and admin can read all"
  ON user_profiles FOR SELECT TO authenticated
  USING (has_feature('hr_manager') OR is_admin());

CREATE POLICY "user_profiles: hr and admin can write"
  ON user_profiles FOR ALL TO authenticated
  USING (has_feature('hr_manager') OR is_admin())
  WITH CHECK (has_feature('hr_manager') OR is_admin());

-- ────────────────────────────────────────────────────────────
-- COMPANIES
-- ────────────────────────────────────────────────────────────
CREATE POLICY "companies: authenticated can read"
  ON companies FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "companies: admin can write"
  ON companies FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "documents: read shared and own department"
  ON documents FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      folder = 'shared' OR
      uploaded_by = auth.uid() OR
      owner_id = auth.uid() OR
      is_admin() OR
      (folder = 'internal' AND department_id = (SELECT department_id FROM users WHERE id = auth.uid())) OR
      has_feature('approve_contract')
    )
  );

CREATE POLICY "documents: authenticated can insert"
  ON documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "documents: uploader or admin can update"
  ON documents FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR is_admin() OR has_feature('approve_contract'));

-- ────────────────────────────────────────────────────────────
-- DOCUMENT CONFIRMATIONS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "document_confirmations: self can read own"
  ON document_confirmations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('publish_announcement'));

CREATE POLICY "document_confirmations: self can insert"
  ON document_confirmations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- DOCUMENT RECIPIENTS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "document_recipients: self can read own"
  ON document_recipients FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('publish_announcement'));

-- ────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "audit_logs: admin can read"
  ON audit_logs FOR SELECT TO authenticated
  USING (is_admin());

-- No direct insert/update/delete by users — service role only

-- ────────────────────────────────────────────────────────────
-- ATTENDANCE
-- ────────────────────────────────────────────────────────────
CREATE POLICY "attendance_records: self can read own"
  ON attendance_records FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    is_admin() OR
    has_feature('hr_manager') OR
    user_id IN (SELECT id FROM users WHERE manager_id = auth.uid())
  );

CREATE POLICY "attendance_records: self can insert"
  ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "attendance_records: self can update own"
  ON attendance_records FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR has_feature('hr_manager'));

-- ────────────────────────────────────────────────────────────
-- LEAVE
-- ────────────────────────────────────────────────────────────
CREATE POLICY "leave_types: all can read active"
  ON leave_types FOR SELECT TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "leave_types: hr/admin can write"
  ON leave_types FOR ALL TO authenticated
  USING (has_feature('hr_manager') OR is_admin())
  WITH CHECK (has_feature('hr_manager') OR is_admin());

CREATE POLICY "leave_balances: self or hr/admin can read"
  ON leave_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_feature('hr_manager') OR is_admin());

CREATE POLICY "leave_balances: hr/admin can write"
  ON leave_balances FOR ALL TO authenticated
  USING (has_feature('hr_manager') OR is_admin())
  WITH CHECK (has_feature('hr_manager') OR is_admin());

CREATE POLICY "leave_requests: self, approver, hr, admin can read"
  ON leave_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    is_admin() OR
    has_feature('hr_manager') OR
    approved_by = auth.uid() OR
    (SELECT manager_id FROM users WHERE id = leave_requests.user_id) = auth.uid()
  );

CREATE POLICY "leave_requests: self can insert"
  ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "leave_requests: self can cancel, approver can approve/reject"
  ON leave_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR
    is_admin() OR
    has_feature('hr_manager') OR
    (SELECT manager_id FROM users WHERE id = leave_requests.user_id) = auth.uid()
  );

-- ────────────────────────────────────────────────────────────
-- OVERTIME
-- ────────────────────────────────────────────────────────────
CREATE POLICY "overtime_rates: all can read"
  ON overtime_rates FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "overtime_rates: hr/admin can write"
  ON overtime_rates FOR ALL TO authenticated
  USING (has_feature('hr_manager') OR is_admin())
  WITH CHECK (has_feature('hr_manager') OR is_admin());

CREATE POLICY "projects: all active users can read active"
  ON projects FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "projects: manage_projects or admin can write"
  ON projects FOR ALL TO authenticated
  USING (has_feature('manage_projects') OR is_admin())
  WITH CHECK (has_feature('manage_projects') OR is_admin());

CREATE POLICY "project_members: all can read"
  ON project_members FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "project_members: project lead or admin can write"
  ON project_members FOR ALL TO authenticated
  USING (
    is_admin() OR
    has_feature('manage_projects') OR
    project_id IN (SELECT id FROM projects WHERE project_lead_id = auth.uid())
  );

CREATE POLICY "overtime_requests: self, approver, admin can read"
  ON overtime_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    is_admin() OR
    has_feature('hr_manager') OR
    has_feature('coo_notify') OR
    project_id IN (SELECT id FROM projects WHERE project_lead_id = auth.uid()) OR
    (SELECT manager_id FROM users WHERE id = overtime_requests.user_id) = auth.uid()
  );

CREATE POLICY "overtime_requests: self can insert"
  ON overtime_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "overtime_requests: approvers can update"
  ON overtime_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR
    is_admin() OR
    (SELECT manager_id FROM users WHERE id = overtime_requests.user_id) = auth.uid() OR
    project_id IN (SELECT id FROM projects WHERE project_lead_id = auth.uid()) OR
    has_feature('coo_notify')
  );

-- ────────────────────────────────────────────────────────────
-- PAYROLL
-- ────────────────────────────────────────────────────────────
CREATE POLICY "insurance_brackets: hr/finance/admin can read"
  ON labor_insurance_brackets FOR SELECT TO authenticated
  USING (has_feature('hr_manager') OR has_feature('finance_payroll') OR is_admin());

CREATE POLICY "insurance_brackets: finance/admin can write"
  ON labor_insurance_brackets FOR ALL TO authenticated
  USING (has_feature('finance_payroll') OR is_admin())
  WITH CHECK (has_feature('finance_payroll') OR is_admin());

CREATE POLICY "health_insurance_brackets: hr/finance/admin can read"
  ON health_insurance_brackets FOR SELECT TO authenticated
  USING (has_feature('hr_manager') OR has_feature('finance_payroll') OR is_admin());

CREATE POLICY "health_insurance_brackets: finance/admin can write"
  ON health_insurance_brackets FOR ALL TO authenticated
  USING (has_feature('finance_payroll') OR is_admin())
  WITH CHECK (has_feature('finance_payroll') OR is_admin());

CREATE POLICY "payroll_records: self can read own"
  ON payroll_records FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    has_feature('hr_manager') OR
    has_feature('finance_payroll') OR
    has_feature('coo_notify') OR
    is_admin()
  );

CREATE POLICY "payroll_records: hr/finance/admin can write"
  ON payroll_records FOR ALL TO authenticated
  USING (has_feature('hr_manager') OR has_feature('finance_payroll') OR has_feature('coo_notify') OR is_admin())
  WITH CHECK (has_feature('hr_manager') OR has_feature('finance_payroll') OR has_feature('coo_notify') OR is_admin());

CREATE POLICY "bonus_records: self can read own, hr/admin can read all"
  ON bonus_records FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_feature('hr_manager') OR has_feature('finance_payroll') OR is_admin());

CREATE POLICY "bonus_records: hr/finance/admin can write"
  ON bonus_records FOR ALL TO authenticated
  USING (has_feature('hr_manager') OR has_feature('finance_payroll') OR is_admin())
  WITH CHECK (has_feature('hr_manager') OR has_feature('finance_payroll') OR is_admin());

-- ────────────────────────────────────────────────────────────
-- FEEDBACK
-- ────────────────────────────────────────────────────────────
CREATE POLICY "feedback: self can read own, admin can read all"
  ON feedback FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR is_admin());

CREATE POLICY "feedback: authenticated can submit"
  ON feedback FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "feedback: admin can update status"
  ON feedback FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────────
-- SYSTEM SETTINGS
-- ────────────────────────────────────────────────────────────
CREATE POLICY "system_settings: admin can read/write"
  ON system_settings FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- work_schedules
CREATE POLICY "work_schedules: all can read"
  ON work_schedules FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "work_schedules: admin can write"
  ON work_schedules FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
