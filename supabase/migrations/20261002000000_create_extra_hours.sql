-- Migration: Create extra_hours table for admin-assigned additional hours
-- Only admin users can insert/update/delete. All authenticated users can read.

CREATE TABLE IF NOT EXISTS public.extra_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Denormalized snapshot fields for display / export
  employee_name TEXT NOT NULL,
  staff_id TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  -- Period
  entry_month INT NOT NULL CHECK (entry_month BETWEEN 1 AND 12),
  entry_year  INT NOT NULL CHECK (entry_year  BETWEEN 2000 AND 2100),
  -- Hours & financials
  hours_assigned NUMERIC(6,2) NOT NULL CHECK (hours_assigned >= 0),
  hourly_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost     NUMERIC(12,2) GENERATED ALWAYS AS (hours_assigned * hourly_rate) STORED,
  -- Status
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Approved' CHECK (status IN ('Approved', 'Pending')),
  -- Notes
  notes TEXT,
  -- Audit
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_extra_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_extra_hours_updated_at ON public.extra_hours;
CREATE TRIGGER set_extra_hours_updated_at
BEFORE UPDATE ON public.extra_hours
FOR EACH ROW EXECUTE FUNCTION update_extra_hours_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extra_hours_profile ON public.extra_hours(profile_id);
CREATE INDEX IF NOT EXISTS idx_extra_hours_period  ON public.extra_hours(entry_year, entry_month);
CREATE INDEX IF NOT EXISTS idx_extra_hours_dept    ON public.extra_hours(department_id);

-- Row Level Security
ALTER TABLE public.extra_hours ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admin full access on extra_hours"
  ON public.extra_hours
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Authenticated users: read-only (so dashboard/reports can read)
CREATE POLICY "Authenticated read extra_hours"
  ON public.extra_hours
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
