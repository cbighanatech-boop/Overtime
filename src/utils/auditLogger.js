import { supabase } from '../supabase/client'

export const logActivity = async (action, details = {}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !session.user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .single()

    const performedBy = profile?.full_name || session.user.email

    await supabase.from('audit_logs').insert({
      action,
      performed_by: performedBy,
      details,
      performed_at: new Date().toISOString()
    })
  } catch (err) {
    console.error("Failed to log audit activity:", err.message)
  }
}
