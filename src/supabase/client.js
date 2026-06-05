import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vivbsrvnrlqwbnmnhrrb.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpdmJzcnZucmxxd2JubW5ocnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjMzMTgsImV4cCI6MjA4OTU5OTMxOH0.2kGvptGRlWXhyoTH02R9zORecph-KFaHT5YoUb3FURo'

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables!")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
