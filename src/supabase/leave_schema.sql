-- ==========================================================
-- CBI GHANA LTD - LEAVE MANAGEMENT SYSTEM (SAFE / NON-DESTRUCTIVE)
-- ==========================================================

-- 1. LEAVE TYPES TABLE
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  default_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  description TEXT,
  requires_attachment BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default leave types (Compassionate Leave is set to 5 days)
INSERT INTO leave_types (name, default_days, description)
VALUES 
  ('Annual Leave', 15.0, 'Standard annual statutory holiday entitlement'),
  ('Sick Leave', 10.0, 'Medical or illness-related absence'),
  ('Casual Leave', 5.0, 'Short-term personal urgent matters'),
  ('Maternity Leave', 90.0, 'Maternity leave for female employees'),
  ('Paternity Leave', 5.0, 'Paternity leave for male employees'),
  ('Compassionate Leave', 5.0, 'Bereavement or compassionate family emergency'),
  ('Study Leave', 5.0, 'Examinations and approved educational development')
ON CONFLICT (name) DO NOTHING;

-- 2. LEAVE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(5,1) NOT NULL CHECK (total_days > 0),
  reason TEXT NOT NULL,
  contact_phone TEXT,
  handover_notes TEXT,
  relief_staff_name TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Declined', 'Cancelled')),
  captured_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LEAVE BALANCES TABLE
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  entitled_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, leave_type_id, year)
);

-- 4. TIMESTAMP TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_leave_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. BALANCE AUTO-UPDATE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION handle_leave_request_status_change()
RETURNS TRIGGER AS $$
DECLARE
  req_year INT;
BEGIN
  req_year := EXTRACT(YEAR FROM NEW.start_date);

  IF (NEW.status = 'Approved' AND (OLD.status IS DISTINCT FROM 'Approved')) THEN
    INSERT INTO leave_balances (employee_id, employee_name, department_id, leave_type_id, year, entitled_days, used_days)
    SELECT 
      NEW.employee_id, 
      NEW.employee_name, 
      NEW.department_id, 
      NEW.leave_type_id, 
      req_year, 
      lt.default_days, 
      NEW.total_days
    FROM leave_types lt WHERE lt.id = NEW.leave_type_id
    ON CONFLICT (employee_id, leave_type_id, year) 
    DO UPDATE SET 
      used_days = leave_balances.used_days + EXCLUDED.used_days,
      updated_at = NOW();
  END IF;

  IF (OLD.status = 'Approved' AND NEW.status IN ('Declined', 'Cancelled')) THEN
    UPDATE leave_balances
    SET used_days = GREATEST(0, used_days - OLD.total_days),
        updated_at = NOW()
    WHERE employee_id = OLD.employee_id
      AND leave_type_id = OLD.leave_type_id
      AND year = req_year;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. ATTACH TRIGGERS SAFELY
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_types_updated') THEN
    CREATE TRIGGER trg_leave_types_updated
    BEFORE UPDATE ON leave_types
    FOR EACH ROW EXECUTE FUNCTION update_leave_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_requests_updated') THEN
    CREATE TRIGGER trg_leave_requests_updated
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION update_leave_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_balances_updated') THEN
    CREATE TRIGGER trg_leave_balances_updated
    BEFORE UPDATE ON leave_balances
    FOR EACH ROW EXECUTE FUNCTION update_leave_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_status_balance') THEN
    CREATE TRIGGER trg_leave_status_balance
    AFTER UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION handle_leave_request_status_change();
  END IF;
END $$;

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_leave_requests_dept ON leave_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_emp ON leave_balances(employee_id, year);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_types' AND policyname = 'Allow all authenticated on leave_types') THEN
    CREATE POLICY "Allow all authenticated on leave_types" ON leave_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_requests' AND policyname = 'Allow all authenticated on leave_requests') THEN
    CREATE POLICY "Allow all authenticated on leave_requests" ON leave_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_balances' AND policyname = 'Allow all authenticated on leave_balances') THEN
    CREATE POLICY "Allow all authenticated on leave_balances" ON leave_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_notifications' AND policyname = 'Allow all authenticated on leave_notifications') THEN
    CREATE POLICY "Allow all authenticated on leave_notifications" ON leave_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 9. NOTIFICATIONS AUDIT TABLE
CREATE TABLE IF NOT EXISTS leave_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'Sent',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE leave_notifications ENABLE ROW LEVEL SECURITY;
