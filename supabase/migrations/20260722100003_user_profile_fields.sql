-- Expand user_profiles with HR-requested personnel fields.
--
-- WHY: HR needs to record (a) the employee's Chinese legal name separately from
-- the system display name (which lives on users.display_name and is often the
-- English/romanized name), (b) the identity-document TYPE — foreign staff hold a
-- 居留證 (resident permit) rather than a 身分證 (national ID), (c) a distinct
-- 戶籍地址 (household-registration address) alongside the existing 通訊地址
-- (mailing address, stored in `address`), and (d) an explicit salary TYPE so
-- monthly-vs-hourly is recorded on the profile instead of only inferred from
-- employment_type.
--
-- Additive + idempotent: every column uses ADD COLUMN IF NOT EXISTS, so a re-run
-- is a no-op and the inline CHECK constraints are only created on first add.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS chinese_name TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS id_type TEXT NOT NULL DEFAULT 'national_id'
  CHECK (id_type IN ('national_id', 'resident_permit'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS registered_address TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS salary_type TEXT
  CHECK (salary_type IN ('monthly', 'hourly'));
