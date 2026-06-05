import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uwphxlefoexkanpsptqt.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cGh4bGVmb2V4a2FucHNwdHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MDUxMzIsImV4cCI6MjA5NTA4MTEzMn0.RQah-7Ht3-0t6i1f_8taPswRKhU0WfZWmtdFdt1a1cg'

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables!")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
