-- ==========================================================
-- Allow Rep users to DELETE Pending overtime records in their own department
-- ==========================================================

-- Drop if exists to make migration idempotent
DROP POLICY IF EXISTS "Rep deletes Pending records in own department" ON public.overtime_records;

-- Rep: Delete strictly Pending records in own department
CREATE POLICY "Rep deletes Pending records in own department"
ON public.overtime_records FOR DELETE TO authenticated
USING (
  public.get_my_role() = 'rep' AND
  department_id = public.get_my_department() AND
  status = 'Pending'
);
