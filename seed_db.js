import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vivbsrvnrlqwbnmnhrrb.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpdmJzcnZucmxxd2JubW5ocnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjMzMTgsImV4cCI6MjA4OTU5OTMxOH0.2kGvptGRlWXhyoTH02R9zORecph-KFaHT5YoUb3FURo'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function seedDatabase() {
  console.log('🌱 Starting database seeding and user provisioning...')

  // 1. Seed departments
  console.log('Creating departments...')
  const deptsToSeed = ['Engineering', 'Production', 'Operations']
  const depts = {}

  for (const name of deptsToSeed) {
    // Check if exists
    const { data: existing, error: fetchErr } = await supabase
      .from('departments')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (fetchErr) {
      console.error(`Error checking department ${name}:`, fetchErr.message)
      console.log('🚨 Please make sure you have executed src/supabase/schema.sql in the Supabase SQL Editor!')
      return
    }

    if (existing) {
      console.log(`Department "${name}" already exists.`)
      depts[name] = existing.id
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('departments')
        .insert({ name })
        .select('id')
        .single()

      if (insertErr) {
        console.error(`Error inserting department ${name}:`, insertErr.message)
        return
      }
      console.log(`✅ Created department "${name}".`)
      depts[name] = inserted.id
    }
  }

  // 2. Register User Accounts
  const usersToRegister = [
    {
      email: 'admin@cbi-overtime.com',
      password: 'Password123',
      fullName: 'Richmond Appiah',
      role: 'admin',
      deptName: 'Engineering'
    },
    {
      email: 'supervisor@cbi-overtime.com',
      password: 'Password123',
      fullName: 'David Mills',
      role: 'supervisor',
      deptName: 'Production'
    },
    {
      email: 'rep@cbi-overtime.com',
      password: 'Password123',
      fullName: 'Kofi Mensah',
      role: 'rep',
      deptName: 'Operations'
    }
  ]

  console.log('\nRegistering test users in Supabase Auth...')
  for (const u of usersToRegister) {
    const departmentId = depts[u.deptName] || null

    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
      options: {
        data: {
          full_name: u.fullName,
          role: u.role,
          department_id: departmentId
        }
      }
    })

    if (error) {
      if (error.message.includes('already registered') || error.status === 422) {
        console.log(`⚠️  User ${u.email} is already registered in Auth.`)
      } else {
        console.error(`❌ Failed to register ${u.email}:`, error.message)
      }
    } else {
      console.log(`✅ Registered ${u.fullName} (${u.role}) successfully!`)
    }
  }

  console.log('\n🎉 Seeding process complete!')
  console.log('You can now log in with the emails and Password123!')
}

seedDatabase()
