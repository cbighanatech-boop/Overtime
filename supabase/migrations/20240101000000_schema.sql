-- ==========================================================
-- TIME & ATTENDANCE (OVERTIME CAPTURE) DATABASE SCHEMA
-- ==========================================================
-- This file contains the complete database schema for the Overtime App.
-- Run this in the Supabase SQL Editor to set up your tables, triggers, and indexes.

-- 1. DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROFILES TABLE (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'rep', 'supervisor')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TRIGGER FUNCTION FOR AUTH USER SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, department_id, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'rep'),
    CASE 
      WHEN NEW.raw_user_meta_data->>'department_id' IS NOT NULL AND NEW.raw_user_meta_data->>'department_id' <> ''
        THEN (NEW.raw_user_meta_data->>'department_id')::UUID 
      ELSE NULL 
    END,
    TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. OVERTIME RECORDS TABLE
CREATE TABLE IF NOT EXISTS overtime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('Straight Day', 'Shift')),
  reason TEXT NOT NULL,
  work_date DATE NOT NULL,
  time_in TIME NOT NULL,
  time_out TIME NOT NULL,
  -- Computes hours elapsed. Handles overnight shifts (e.g., 22:00 to 06:00) cleanly.
  overtime_hours NUMERIC(5,2) GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (
      CASE 
        WHEN time_out < time_in 
          THEN (time_out - time_in) + INTERVAL '24 hours'
        ELSE time_out - time_in 
      END
    )) / 3600
  ) STORED,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Declined')),
  captured_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  comments TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TRIGGER FOR UPDATED_AT FIELD
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON overtime_records;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON overtime_records
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_overtime_department ON overtime_records(department_id);
CREATE INDEX IF NOT EXISTS idx_overtime_status ON overtime_records(status);
CREATE INDEX IF NOT EXISTS idx_overtime_date ON overtime_records(work_date);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department_id);
