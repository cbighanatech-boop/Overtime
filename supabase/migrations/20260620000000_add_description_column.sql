-- Migration to add description column to overtime_records
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS description TEXT;
