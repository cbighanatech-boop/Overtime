import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY // Actually we might need service_role key to bypass email confirmation and update roles easily, but let's try anon first
const supabase = createClient(supabaseUrl, supabaseKey)

const users = [
  { email: 'admin@cbi-overtime.com', password: 'Password123', role: 'admin', full_name: 'Admin User' },
  { email: 'supervisor@cbi-overtime.com', password: 'Password123', role: 'supervisor', full_name: 'Supervisor User' },
  { email: 'rep@cbi-overtime.com', password: 'Password123', role: 'rep', full_name: 'Rep User' },
]

async function seed() {
  for (const u of users) {
    console.log(`Creating ${u.email}...`)
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
    })
    
    if (authErr) {
      console.log(`Error signing up ${u.email}:`, authErr.message)
      continue
    }

    const userId = authData.user?.id
    if (!userId) continue

    // Insert or update profile
    const { error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: u.full_name,
        role: u.role,
        is_active: true
      })
      
    if (profErr) {
      console.log(`Error updating profile for ${u.email}:`, profErr.message)
    } else {
      console.log(`Successfully created ${u.email} (${u.role})`)
    }
  }
}

seed()
