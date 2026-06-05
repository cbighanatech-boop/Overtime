create policy "admin_can_assign_department" on public.profiles for update using (
  (select role from public.profiles where id = auth.uid()) = 'admin'
) with check (true);
