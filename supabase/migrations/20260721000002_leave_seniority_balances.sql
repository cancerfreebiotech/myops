-- Anniversary-based (週年制) 特休 support on leave_balances.
--
-- WHY: 特休 (annual leave) is quota_type='by_seniority' with default_quota_days=NULL,
-- but no seniority computation existed — HR had to eyeball each person's days, and
-- the store is keyed by calendar year while the company grants 特休 on each
-- employee's hire ANNIVERSARY (週年制). Reported by Linda Chao ("特休設定有誤").
--
-- Company policy (per the report): entitlement resets on the 到職日 anniversary,
-- by completed years of service — <3y→10, 3–5y→14, 5–10y→15, ≥10y→+1/yr cap 30.
--
-- Design (confirmed): keep leave_balances as the single source of truth. A row may
-- now describe an anniversary PERIOD (period_start..period_end) instead of a plain
-- calendar year. `source` distinguishes auto-generated (from seniority) rows from
-- manual HR overrides, so regeneration never clobbers a hand-entered value.
--
-- Existing rows are treated as manual and left untouched (source defaults to
-- 'manual', period_start/period_end NULL). The balance lookup resolves a leave
-- date to the period row that contains it, else falls back to the calendar-year
-- row — so manual/calendar rows and other leave types keep working unchanged.

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end   date;

COMMENT ON COLUMN leave_balances.source IS
  'auto = generated from seniority (週年制 特休); manual = HR override. Auto-fill never overwrites manual rows.';
COMMENT ON COLUMN leave_balances.period_start IS
  'For anniversary-based (週年制) balances: start of the entitlement window (inclusive). NULL for calendar-year rows.';
COMMENT ON COLUMN leave_balances.period_end IS
  'For anniversary-based (週年制) balances: end of the entitlement window (inclusive). NULL for calendar-year rows.';

-- Helps the period-containment lookup (user_id + leave_type_id already lead the
-- UNIQUE(user_id, leave_type_id, year) index; this covers the date-range probe).
CREATE INDEX IF NOT EXISTS idx_leave_balances_period
  ON leave_balances (user_id, leave_type_id, period_start, period_end)
  WHERE period_start IS NOT NULL;

-- No RLS change: leave_balances already has "hr/admin can write" (ALL) +
-- "self or hr/admin can read" (SELECT). The generator runs via the admin client
-- (authorization enforced in the route), same as the existing balance save/deduct.
