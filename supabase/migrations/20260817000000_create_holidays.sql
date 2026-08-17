-- Migration: Create holidays table
-- Date: 2026-08-17

CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(holiday_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- 1. Anyone authenticated can view holidays
DROP POLICY IF EXISTS "Anyone can read holidays" ON public.holidays;
CREATE POLICY "Anyone can read holidays" ON public.holidays
  FOR SELECT TO authenticated USING (true);

-- 2. Only admin users can insert holidays
DROP POLICY IF EXISTS "Only admins can insert holidays" ON public.holidays;
CREATE POLICY "Only admins can insert holidays" ON public.holidays
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 3. Only admin users can update holidays
DROP POLICY IF EXISTS "Only admins can update holidays" ON public.holidays;
CREATE POLICY "Only admins can update holidays" ON public.holidays
  FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 4. Only admin users can delete holidays
DROP POLICY IF EXISTS "Only admins can delete holidays" ON public.holidays;
CREATE POLICY "Only admins can delete holidays" ON public.holidays
  FOR DELETE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
