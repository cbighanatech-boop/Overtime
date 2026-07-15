-- Migration: Add admin_entry_blocks table, company column on profiles, and hourly_rate on profiles
-- Date: 2026-07-15

-- 1. admin_entry_blocks table — stores time windows during which entries are blocked
CREATE TABLE IF NOT EXISTS admin_entry_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Admin block',
  company TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_blocks_range ON admin_entry_blocks(start_at, end_at);

-- 2. company column on profiles (for CBI / Abanach distinction)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company TEXT DEFAULT 'CBI';

-- 3. hourly_rate column on profiles (employee-level stored rate)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 0;

-- 4. RLS policies for admin_entry_blocks
ALTER TABLE admin_entry_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read entry blocks" ON admin_entry_blocks;
CREATE POLICY "Anyone can read entry blocks" ON admin_entry_blocks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can insert entry blocks" ON admin_entry_blocks;
CREATE POLICY "Only admins can insert entry blocks" ON admin_entry_blocks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Only admins can delete entry blocks" ON admin_entry_blocks;
CREATE POLICY "Only admins can delete entry blocks" ON admin_entry_blocks
  FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
