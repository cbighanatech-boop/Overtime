-- Leave Audit Logs table
-- Records administrative actions (edits, deletions) on leave requests
-- for a complete audit trail visible to Admin users.

CREATE TABLE IF NOT EXISTS leave_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID,  -- the leave_request ID (may be null if deleted)
  action TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'edit', 'delete', 'admin'
  employee_name TEXT,
  employee_id TEXT,
  department TEXT,
  leave_type TEXT,
  total_days NUMERIC,
  start_date DATE,
  end_date DATE,
  performed_by TEXT NOT NULL,
  performed_by_role TEXT,
  performed_at TIMESTAMPTZ DEFAULT now(),
  status TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient time-based queries
CREATE INDEX IF NOT EXISTS idx_leave_audit_logs_performed_at
  ON leave_audit_logs (performed_at DESC);

-- Index for filtering by request
CREATE INDEX IF NOT EXISTS idx_leave_audit_logs_request_id
  ON leave_audit_logs (request_id);

-- RLS: Only authenticated users can insert (the app inserts on behalf of admin)
ALTER TABLE leave_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read audit logs (UI enforces admin-only access)
CREATE POLICY "Authenticated users can read leave audit logs"
  ON leave_audit_logs FOR SELECT
  TO authenticated
  USING (true);

-- Allow all authenticated users to insert audit logs (admin actions are validated in the app)
CREATE POLICY "Authenticated users can insert leave audit logs"
  ON leave_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
