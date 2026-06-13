-- Migration: Add financial fields to overtime_records
-- Adds hourly_rate, rate_multiplier, and estimated_payout columns

ALTER TABLE public.overtime_records
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_multiplier NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_payout NUMERIC;

-- Optionally, you may want to backfill existing rows if needed
-- UPDATE public.overtime_records SET hourly_rate = 0, rate_multiplier = 1, estimated_payout = 0;
