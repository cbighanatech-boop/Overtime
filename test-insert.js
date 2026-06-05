import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uwphxlefoexkanpsptqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cGh4bGVmb2V4a2FucHNwdHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MDUxMzIsImV4cCI6MjA5NTA4MTEzMn0.RQah-7Ht3-0t6i1f_8taPswRKhU0WfZWmtdFdt1a1cg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const newUserId = crypto.randomUUID();
  const dummyEmail = `${newUserId}@cbi-overtime.local`;
  
  const { data, error } = await supabase.from('profiles').insert({
    id: newUserId,
    email: dummyEmail,
    password: 'NoLogin123!',
    full_name: 'Test Name',
    staff_id: 'Test-123',
    category: 'Shift',
    position: 'Test',
    role: 'employee',
    department_id: null,
    is_active: true,
  });

  console.log('Error:', error);
  console.log('Data:', data);
}

test();
