-- Migration to add RPC for assigning departments securely
CREATE OR REPLACE FUNCTION public.assign_user_department(p_user_id UUID, p_department_id UUID)
RETURNS void AS $$
BEGIN
  -- Only allow admins to execute this
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles 
  SET department_id = p_department_id
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
