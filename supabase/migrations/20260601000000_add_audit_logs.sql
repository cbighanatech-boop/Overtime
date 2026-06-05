-- Migration: Add audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    details JSONB,
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON public.audit_logs(performed_at DESC);
