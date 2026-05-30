-- Add employee fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN staff_id TEXT UNIQUE,
ADD COLUMN category TEXT,
ADD COLUMN position TEXT;
