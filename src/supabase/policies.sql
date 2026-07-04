-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
-- This file contains all the RLS policies and role helper functions.
-- Run this in the Supabase SQL Editor after running schema.sql.

-- 1. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_records ENABLE ROW LEVEL SECURITY;

-- 2. HELPER FUNCTIONS (Bypasses RLS using SECURITY DEFINER to prevent recursion)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_department()
RETURNS UUID AS $$
DECLARE
  user_dept UUID;
BEGIN
  SELECT department_id INTO user_dept FROM public.profiles WHERE id = auth.uid();
  RETURN user_dept;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. DEPARTMENTS POLICIES
-- Clean up existing policies
DROP POLICY IF EXISTS "All authenticated users can view departments" ON public.departments;
DROP POLICY IF EXISTS "Admin manages departments" ON public.departments;

-- Allow all logged-in users to view departments (needed for dropdowns)
CREATE POLICY "All authenticated users can view departments"
ON public.departments FOR SELECT TO authenticated
USING (true);

-- Admin can perform all operations (create, update, delete)
CREATE POLICY "Admin manages departments"
ON public.departments FOR ALL TO authenticated
USING (public.get_my_role() = 'admin');


-- 4. PROFILES POLICIES
-- Clean up existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin manages all profiles" ON public.profiles;

-- Allow users to view their own profile details
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- Allow admins to view all profiles
CREATE POLICY "Admin can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.get_my_role() = 'admin');

-- Allow admins to manage (insert, update, delete) all profiles
CREATE POLICY "Admin manages all profiles"
ON public.profiles FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');


-- 5. OVERTIME RECORDS POLICIES
-- Clean up existing policies
DROP POLICY IF EXISTS "Admin full access to records" ON public.overtime_records;
DROP POLICY IF EXISTS "Rep reads own department records" ON public.overtime_records;
DROP POLICY IF EXISTS "Rep inserts records for own department" ON public.overtime_records;
DROP POLICY IF EXISTS "Rep updates Pending records in own department" ON public.overtime_records;
DROP POLICY IF EXISTS "Supervisor reads own department records" ON public.overtime_records;
DROP POLICY IF EXISTS "Supervisor approves or declines own department" ON public.overtime_records;

-- Admin: full access to everything (all departments, all statuses)
CREATE POLICY "Admin full access to records"
ON public.overtime_records FOR ALL TO authenticated
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

-- Rep: Read records in own department
CREATE POLICY "Rep reads own department records"
ON public.overtime_records FOR SELECT TO authenticated
USING (
  public.get_my_role() = 'rep' AND
  department_id = public.get_my_department()
);

-- Rep: Insert records strictly for own department
CREATE POLICY "Rep inserts records for own department"
ON public.overtime_records FOR INSERT TO authenticated
WITH CHECK (
  public.get_my_role() = 'rep' AND
  department_id = public.get_my_department() AND
  captured_by = auth.uid()
);

-- Rep: Update strictly Pending records in own department
CREATE POLICY "Rep updates Pending records in own department"
ON public.overtime_records FOR UPDATE TO authenticated
USING (
  public.get_my_role() = 'rep' AND
  department_id = public.get_my_department() AND
  status = 'Pending'
)
WITH CHECK (
  public.get_my_role() = 'rep' AND
  department_id = public.get_my_department() AND
  status = 'Pending'
);

-- Supervisor: Read records in own department
CREATE POLICY "Supervisor reads own department records"
ON public.overtime_records FOR SELECT TO authenticated
USING (
  public.get_my_role() = 'supervisor' AND
  department_id = public.get_my_department()
);

-- Supervisor: Approve or decline (update status and reviews) in own department
CREATE POLICY "Supervisor approves or declines own department"
ON public.overtime_records FOR UPDATE TO authenticated
USING (
  public.get_my_role() = 'supervisor' AND
  department_id = public.get_my_department()
)
WITH CHECK (
  public.get_my_role() = 'supervisor' AND
  department_id = public.get_my_department()
);
