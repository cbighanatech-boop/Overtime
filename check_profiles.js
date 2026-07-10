import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkProfiles() {
  const { data, error } = await supabase.from('profiles').select('*')
  console.log(data)
  if (error) console.error(error)
}

checkProfiles()
