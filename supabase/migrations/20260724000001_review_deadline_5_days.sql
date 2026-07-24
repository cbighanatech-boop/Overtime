-- Migration: Change review_deadline default from 7 days to 5 days
-- Date: 2026-07-24

-- Update the column default from 7 days to 5 days
ALTER TABLE overtime_records 
  ALTER COLUMN review_deadline SET DEFAULT (NOW() + INTERVAL '5 days');

-- Update existing pending records: recalculate deadline as captured_at + 5 days
-- Only updates records that still have the old 7-day deadline (captured_at + 7 days)
UPDATE overtime_records
SET review_deadline = captured_at + INTERVAL '5 days'
WHERE status = 'Pending';
