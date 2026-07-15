-- Migration: Add review_deadline to overtime_records
-- Date: 2026-07-16

-- Add review_deadline column to overtime_records
ALTER TABLE overtime_records 
  ADD COLUMN IF NOT EXISTS review_deadline TIMESTAMPTZ 
  DEFAULT (NOW() + INTERVAL '7 days');

-- Update existing pending records that don't have a deadline
UPDATE overtime_records
SET review_deadline = captured_at + INTERVAL '7 days'
WHERE status = 'Pending' AND review_deadline IS NULL;
