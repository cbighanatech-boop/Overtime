-- Fix database constraints and policies to allow employee creation

-- 1. Update the role CHECK constraint to include 'employee'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'rep', 'supervisor', 'employee'));

-- 2. Drop the foreign key constraint on id so employees can exist without an auth.users record
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 3. Add an RLS policy so reps can insert employees into their own department
DROP POLICY IF EXISTS "Reps can insert employee profiles" ON public.profiles;
CREATE POLICY "Reps can insert employee profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  public.get_my_role() = 'rep' AND 
  department_id = public.get_my_department() AND
  role = 'employee'
);
