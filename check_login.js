import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'supervisor@cbi-overtime.com',
    password: 'Password123'
  })
  console.log('Login attempt:', data, error?.message)
}

check()
