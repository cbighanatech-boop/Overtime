-- Migration: Make overtime_hours writable and add full_work and break_hours columns
-- Date: 2026-08-17

-- 1. Rename old generated column so we can copy values
ALTER TABLE public.overtime_records RENAME COLUMN overtime_hours TO old_overtime_hours;

-- 2. Add standard writable overtime_hours column
ALTER TABLE public.overtime_records ADD COLUMN overtime_hours NUMERIC(5,2);

-- 3. Copy existing calculated hours from old column
UPDATE public.overtime_records SET overtime_hours = old_overtime_hours;

-- 4. Drop the old generated column
ALTER TABLE public.overtime_records DROP COLUMN old_overtime_hours;

-- 5. Add full_work and break_hours columns
ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS full_work BOOLEAN DEFAULT FALSE;
ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS break_hours NUMERIC(5,2) DEFAULT 0;
