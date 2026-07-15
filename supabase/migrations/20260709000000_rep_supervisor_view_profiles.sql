-- Migration to add missing RLS policy for Reps and Supervisors to view profiles in their own department

DROP POLICY IF EXISTS "Reps and Supervisors can view department profiles" ON public.profiles;

CREATE POLICY "Reps and Supervisors can view department profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.get_my_role() IN ('rep', 'supervisor') AND
  department_id = public.get_my_department()
);
