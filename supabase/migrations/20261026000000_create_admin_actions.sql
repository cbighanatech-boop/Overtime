-- Migration: Create admin_actions table for Admin Action Items, Messages, Tasks and Due Reminders
-- Only admin users can insert/update/delete. Admin and assigned users can view.

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  task_description TEXT NOT NULL,
  action_message TEXT,
  due_date DATE NOT NULL,
  due_time TIME,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_name TEXT NOT NULL,
  assigned_email TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  completed_at TIMESTAMPTZ,
  is_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_admin_actions_updated_at ON public.admin_actions;
CREATE TRIGGER set_admin_actions_updated_at
BEFORE UPDATE ON public.admin_actions
FOR EACH ROW EXECUTE FUNCTION update_admin_actions_updated_at();

-- Indexes for performance & query efficiency
CREATE INDEX IF NOT EXISTS idx_admin_actions_due_date ON public.admin_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_admin_actions_status ON public.admin_actions(status);
CREATE INDEX IF NOT EXISTS idx_admin_actions_assigned_to ON public.admin_actions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_admin_actions_priority ON public.admin_actions(priority);

-- Row Level Security
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Admin full access
DROP POLICY IF EXISTS "Admin full access on admin_actions" ON public.admin_actions;
CREATE POLICY "Admin full access on admin_actions"
  ON public.admin_actions
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

-- Policy: Assigned user read access
DROP POLICY IF EXISTS "Assigned user read admin_actions" ON public.admin_actions;
CREATE POLICY "Assigned user read admin_actions"
  ON public.admin_actions
  FOR SELECT
  USING (
    assigned_to = auth.uid()
  );
