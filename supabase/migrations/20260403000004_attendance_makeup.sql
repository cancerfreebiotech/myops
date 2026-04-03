-- Makeup clock requests table
CREATE TABLE IF NOT EXISTS attendance_makeup_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  clock_date   DATE NOT NULL,
  clock_type   TEXT NOT NULL CHECK (clock_type IN ('in', 'out')),
  clock_time   TIMESTAMPTZ NOT NULL,
  reason       TEXT NOT NULL,
  approver_id  UUID REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attendance_makeup_requests ENABLE ROW LEVEL SECURITY;

-- Self can read own
CREATE POLICY "makeup_self_read" ON attendance_makeup_requests
  FOR SELECT USING (user_id = auth.uid());

-- Approver can read requests assigned to them
CREATE POLICY "makeup_approver_read" ON attendance_makeup_requests
  FOR SELECT USING (approver_id = auth.uid());

-- HR/admin can read all
CREATE POLICY "makeup_hr_read" ON attendance_makeup_requests
  FOR SELECT USING (is_admin());

-- Self can insert
CREATE POLICY "makeup_self_insert" ON attendance_makeup_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Approver or admin can update
CREATE POLICY "makeup_approver_update" ON attendance_makeup_requests
  FOR UPDATE USING (approver_id = auth.uid() OR is_admin());
