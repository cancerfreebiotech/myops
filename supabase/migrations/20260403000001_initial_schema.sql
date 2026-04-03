-- ============================================================
-- myOPS v0.1 — Initial Schema
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ORG MODULE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

INSERT INTO departments (name, code) VALUES
  ('業務開發', 'BD'),
  ('實驗室', 'LAB'),
  ('人資', 'HR'),
  ('業務', 'SAL'),
  ('行銷', 'MKT'),
  ('資訊', 'IT'),
  ('營運', 'OM')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              TEXT UNIQUE NOT NULL,
  display_name       TEXT,
  department_id      UUID REFERENCES departments(id),
  role               TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  granted_features   TEXT[] DEFAULT '{}',
  employment_type    TEXT DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'intern')),
  work_region        TEXT DEFAULT 'TW' CHECK (work_region IN ('TW', 'JP', 'US', 'OTHER')),
  manager_id         UUID REFERENCES users(id),
  deputy_approver_id UUID REFERENCES users(id),
  job_title          TEXT,
  is_active          BOOLEAN DEFAULT TRUE,
  language           TEXT DEFAULT 'zh-TW',
  theme              TEXT DEFAULT 'light',
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hire_date          DATE,
  termination_date   DATE,
  id_number          TEXT,
  birth_date         DATE,
  phone              TEXT,
  address            TEXT,
  emergency_contact  TEXT,
  emergency_phone    TEXT,
  bank_code          TEXT,
  bank_account       TEXT,
  labor_pension_self NUMERIC(3,1) DEFAULT 0 CHECK (labor_pension_self BETWEEN 0 AND 6),
  monthly_salary     NUMERIC(12,2),
  hourly_rate        NUMERIC(8,2),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_by         UUID REFERENCES users(id)
);

-- ────────────────────────────────────────────────────────────
-- DMS MODULE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  aliases    TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  title_en              TEXT,
  title_ja              TEXT,
  doc_type              TEXT NOT NULL CHECK (doc_type IN ('ANN','REG','NDA','MOU','CONTRACT','AMEND','INTERNAL')),
  folder                TEXT NOT NULL CHECK (folder IN ('shared','contracts','internal','archived')),
  department_id         UUID REFERENCES departments(id),
  company_id            UUID REFERENCES companies(id),
  related_doc_id        UUID REFERENCES documents(id),
  content_source_lang   TEXT DEFAULT 'zh-TW',
  content_zh            TEXT,
  content_en            TEXT,
  content_ja            TEXT,
  ai_translated         BOOLEAN DEFAULT FALSE,
  file_url              TEXT,
  file_name             TEXT,
  file_size             INTEGER,
  expires_at            DATE,
  owner_id              UUID REFERENCES users(id),
  uploaded_by           UUID REFERENCES users(id),
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','archived','expired')),
  approved_by           UUID REFERENCES users(id),
  approved_at           TIMESTAMPTZ,
  reject_reason         TEXT,
  announcement_category TEXT CHECK (announcement_category IN ('hr','admin','regulation','urgent')),
  reminder_days         INTEGER,
  reminder_until        TEXT DEFAULT 'all_confirmed',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS document_confirmations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  mfa_verified BOOLEAN DEFAULT TRUE,
  UNIQUE(document_id, user_id)
);

CREATE TABLE IF NOT EXISTS document_recipients (
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     UUID REFERENCES documents(id),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL CHECK (action IN ('upload','approve','reject','confirm','archive','restore','download','ai_translate')),
  detail     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- HR — ATTENDANCE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO work_schedules (name, start_time, end_time, is_default) VALUES
  ('標準班', '09:00', '18:00', TRUE)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  clock_date    DATE NOT NULL,
  clock_in      TIMESTAMPTZ,
  clock_out     TIMESTAMPTZ,
  clock_in_lat  NUMERIC(10,7),
  clock_in_lng  NUMERIC(10,7),
  clock_out_lat NUMERIC(10,7),
  clock_out_lng NUMERIC(10,7),
  is_auto_in    BOOLEAN DEFAULT FALSE,
  is_auto_out   BOOLEAN DEFAULT FALSE,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, clock_date)
);

-- ────────────────────────────────────────────────────────────
-- HR — LEAVE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_zh             TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  name_ja             TEXT NOT NULL,
  applicable_to       TEXT DEFAULT 'all' CHECK (applicable_to IN ('full_time','intern','all')),
  salary_ratio        NUMERIC(3,2) DEFAULT 1.0,
  advance_days        INTEGER DEFAULT 0,
  quota_type          TEXT DEFAULT 'fixed' CHECK (quota_type IN ('fixed','by_seniority','unlimited','monthly')),
  default_quota_days  NUMERIC(5,1),
  requires_attachment BOOLEAN DEFAULT FALSE,
  attachment_note     TEXT,
  sort_order          INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO leave_types (name_zh, name_en, name_ja, applicable_to, salary_ratio, advance_days, quota_type, default_quota_days, sort_order) VALUES
  ('特休', 'Annual Leave', '有給休暇', 'full_time', 1.0, 7, 'by_seniority', NULL, 1),
  ('事假', 'Personal Leave', '私用休暇', 'all', 0.0, 1, 'fixed', 14, 2),
  ('病假', 'Sick Leave', '病気休暇', 'full_time', 0.5, 0, 'fixed', 30, 3),
  ('婚假', 'Marriage Leave', '結婚休暇', 'full_time', 1.0, 7, 'fixed', 8, 4),
  ('喪假', 'Bereavement Leave', '忌引休暇', 'full_time', 1.0, 0, 'fixed', 8, 5),
  ('產假', 'Maternity Leave', '産前産後休暇', 'full_time', 1.0, 7, 'fixed', 56, 6),
  ('陪產假', 'Paternity Leave', '配偶出産休暇', 'full_time', 1.0, 7, 'fixed', 7, 7),
  ('公假', 'Official Leave', '公務休暇', 'full_time', 1.0, 1, 'unlimited', NULL, 8),
  ('生理假', 'Menstrual Leave', '生理休暇', 'full_time', 0.0, 0, 'monthly', 1, 9)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  leave_type_id UUID REFERENCES leave_types(id),
  year          INTEGER NOT NULL,
  total_days    NUMERIC(5,1) NOT NULL,
  used_days     NUMERIC(5,1) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_by    UUID REFERENCES users(id),
  UNIQUE(user_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id),
  leave_type_id    UUID REFERENCES leave_types(id),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  start_half       TEXT DEFAULT 'full' CHECK (start_half IN ('full','morning','afternoon')),
  end_half         TEXT DEFAULT 'full' CHECK (end_half IN ('full','morning','afternoon')),
  total_days       NUMERIC(5,1) NOT NULL,
  reason           TEXT,
  deputy_user_id   UUID REFERENCES users(id),
  attachment_url   TEXT,
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  outlook_event_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- HR — OVERTIME
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  project_lead_id UUID REFERENCES users(id),
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS overtime_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_zh     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  name_ja     TEXT NOT NULL,
  rate        NUMERIC(4,2) NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id)
);

INSERT INTO overtime_rates (name_zh, name_en, name_ja, rate, description, sort_order) VALUES
  ('平日加班 前2小時', 'Weekday OT first 2hrs', '平日残業 最初2時間', 1.34, '月薪 ÷ 30 ÷ 8 × 1.34', 1),
  ('平日加班 後2小時', 'Weekday OT next 2hrs', '平日残業 次の2時間', 1.67, '月薪 ÷ 30 ÷ 8 × 1.67', 2),
  ('休息日 前2小時', 'Rest day OT first 2hrs', '休日残業 最初2時間', 1.34, '', 3),
  ('休息日 2-8小時', 'Rest day OT 2-8hrs', '休日残業 2-8時間', 1.67, '', 4),
  ('休息日 8小時以上', 'Rest day OT over 8hrs', '休日残業 8時間超', 2.67, '', 5),
  ('國定假日', 'National holiday', '祝日', 2.00, '加倍發給', 6)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS overtime_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id),
  request_type     TEXT NOT NULL CHECK (request_type IN ('regular','project')),
  project_id       UUID REFERENCES projects(id),
  ot_date          DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  hours            NUMERIC(4,1) NOT NULL,
  reason           TEXT,
  work_content     TEXT,
  overtime_rate_id UUID REFERENCES overtime_rates(id),
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending','lead_approved','coo_approved','approved','rejected')),
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  coo_approved_by  UUID REFERENCES users(id),
  coo_approved_at  TIMESTAMPTZ,
  reject_reason    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- HR — PAYROLL
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labor_insurance_brackets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year INTEGER NOT NULL,
  grade          INTEGER NOT NULL,
  insured_salary NUMERIC(10,0) NOT NULL,
  employee_share NUMERIC(10,0) NOT NULL,
  employer_share NUMERIC(10,0) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by    UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS health_insurance_brackets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_year      INTEGER NOT NULL,
  grade               INTEGER NOT NULL,
  insured_salary      NUMERIC(10,0) NOT NULL,
  employee_share      NUMERIC(10,0) NOT NULL,
  employee_dependents NUMERIC(10,0),
  employer_share      NUMERIC(10,0) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by         UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id),
  year                 INTEGER NOT NULL,
  month                INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  base_salary          NUMERIC(12,2),
  overtime_pay         NUMERIC(12,2) DEFAULT 0,
  bonus                NUMERIC(12,2) DEFAULT 0,
  other_income         NUMERIC(12,2) DEFAULT 0,
  unpaid_leave_deduct  NUMERIC(12,2) DEFAULT 0,
  labor_insurance      NUMERIC(12,2) DEFAULT 0,
  health_insurance     NUMERIC(12,2) DEFAULT 0,
  labor_pension_self   NUMERIC(12,2) DEFAULT 0,
  other_deduction      NUMERIC(12,2) DEFAULT 0,
  gross_pay            NUMERIC(12,2),
  total_deduction      NUMERIC(12,2),
  net_pay              NUMERIC(12,2),
  employer_labor_ins   NUMERIC(12,2) DEFAULT 0,
  employer_health_ins  NUMERIC(12,2) DEFAULT 0,
  employer_pension     NUMERIC(12,2) DEFAULT 0,
  status               TEXT DEFAULT 'draft' CHECK (status IN ('draft','hr_reviewed','finance_confirmed','coo_approved','paid')),
  hr_reviewed_by       UUID REFERENCES users(id),
  hr_reviewed_at       TIMESTAMPTZ,
  finance_confirmed_by UUID REFERENCES users(id),
  finance_confirmed_at TIMESTAMPTZ,
  coo_approved_by      UUID REFERENCES users(id),
  coo_approved_at      TIMESTAMPTZ,
  anomaly_flags        JSONB,
  note                 TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS bonus_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  year        INTEGER NOT NULL,
  month       INTEGER CHECK (month BETWEEN 1 AND 12),
  type        TEXT NOT NULL CHECK (type IN ('year_end','performance','project','other')),
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- FEEDBACK
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('feature_request','bug_report')),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  screenshot_urls TEXT[] DEFAULT '{}',
  submitted_by    UUID REFERENCES users(id),
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')),
  admin_note      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- SYSTEM SETTINGS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

INSERT INTO system_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('mfa_approval_session_minutes', '10'),
  ('contract_reminder_days_first', '90'),
  ('contract_reminder_days_second', '30'),
  ('default_clock_in_time', '09:00'),
  ('default_clock_out_time', '18:00'),
  ('auto_clock_check_delay_minutes', '30'),
  ('intern_missed_clock_alert_threshold', '3'),
  ('fulltime_auto_clock_alert_days', '3'),
  ('overtime_min_advance_hours', '8'),
  ('project_ot_coo_threshold_hours', '8'),
  ('payroll_pay_day', '5'),
  ('payroll_auto_generate_day', '1'),
  ('daily_digest_time', '08:30'),
  ('gemini_api_key', '')
ON CONFLICT (key) DO NOTHING;
