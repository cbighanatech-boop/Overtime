import { supabase } from '../supabase/client'
import { format, isToday, isPast, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns'

const STORAGE_KEY = 'cbi_admin_actions_fallback'

export const SQL_MIGRATION_TEXT = `-- SQL to create admin_actions in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  task_description TEXT NOT NULL,
  action_message TEXT,
  due_date DATE NOT NULL,
  due_time TIME,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_name TEXT NOT NULL,
  assigned_email TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name TEXT,
  completed_at TIMESTAMPTZ,
  is_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on admin_actions"
  ON public.admin_actions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Assigned user read admin_actions"
  ON public.admin_actions FOR SELECT
  USING (assigned_to = auth.uid());
`

// Helper to read localStorage fallback
const getLocalActions = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.error('Failed to read local actions:', err)
    return []
  }
}

// Helper to write localStorage fallback
const saveLocalActions = (actions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
  } catch (err) {
    console.error('Failed to save local actions:', err)
  }
}

/**
 * Fetch all admin actions from Supabase (or fallback to local storage)
 */
export const fetchAdminActions = async () => {
  try {
    const { data, error } = await supabase
      .from('admin_actions')
      .select('*')
      .order('due_date', { ascending: true })

    if (error) {
      console.warn('Supabase admin_actions table unavailable, using local cache:', error.message)
      return { actions: getLocalActions(), isUsingFallback: true }
    }

    return { actions: data || [], isUsingFallback: false }
  } catch (err) {
    console.warn('Network/query error on admin_actions, using local cache:', err.message)
    return { actions: getLocalActions(), isUsingFallback: true }
  }
}

/**
 * Create a new admin action
 */
export const createAdminAction = async (actionData, profile) => {
  const payload = {
    title: actionData.title.trim(),
    task_description: actionData.task_description.trim(),
    action_message: actionData.action_message ? actionData.action_message.trim() : null,
    due_date: actionData.due_date,
    due_time: actionData.due_time || null,
    assigned_to: actionData.assigned_to || null,
    assigned_name: actionData.assigned_name.trim(),
    assigned_email: actionData.assigned_email || null,
    priority: actionData.priority || 'Medium',
    status: actionData.status || 'Pending',
    created_by: profile?.id || null,
    created_by_name: profile?.full_name || 'Admin',
    created_at: new Date().toISOString()
  }

  try {
    const { data, error } = await supabase
      .from('admin_actions')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return { success: true, action: data, isUsingFallback: false }
  } catch (err) {
    console.warn('Failed to insert into Supabase, saving locally:', err.message)
    const localItem = {
      ...payload,
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      updated_at: new Date().toISOString()
    }
    const current = getLocalActions()
    saveLocalActions([localItem, ...current])
    return { success: true, action: localItem, isUsingFallback: true }
  }
}

/**
 * Update an existing action
 */
export const updateAdminAction = async (id, updates) => {
  const isLocalId = String(id).startsWith('local_')

  if (!isLocalId) {
    try {
      const payload = { ...updates, updated_at: new Date().toISOString() }
      if (updates.status === 'Completed' && !updates.completed_at) {
        payload.completed_at = new Date().toISOString()
      } else if (updates.status && updates.status !== 'Completed') {
        payload.completed_at = null
      }

      const { data, error } = await supabase
        .from('admin_actions')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (!error) {
        return { success: true, action: data }
      }
    } catch (err) {
      console.warn('Supabase update failed, attempting local fallback update:', err.message)
    }
  }

  // Fallback update in local storage
  const current = getLocalActions()
  const updated = current.map(item => {
    if (item.id === id) {
      return {
        ...item,
        ...updates,
        completed_at: updates.status === 'Completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }
    }
    return item
  })
  saveLocalActions(updated)
  const item = updated.find(i => i.id === id)
  return { success: true, action: item, isUsingFallback: true }
}

/**
 * Delete an action
 */
export const deleteAdminAction = async (id) => {
  const isLocalId = String(id).startsWith('local_')

  if (!isLocalId) {
    try {
      const { error } = await supabase
        .from('admin_actions')
        .delete()
        .eq('id', id)

      if (!error) {
        return { success: true }
      }
    } catch (err) {
      console.warn('Supabase delete failed, attempting local fallback delete:', err.message)
    }
  }

  const current = getLocalActions()
  saveLocalActions(current.filter(item => item.id !== id))
  return { success: true, isUsingFallback: true }
}

/**
 * Categorize action due status:
 * - 'completed'
 * - 'due-today'
 * - 'overdue'
 * - 'due-soon' (within next 3 days)
 * - 'upcoming'
 */
export const getActionDueStatus = (action) => {
  if (action.status === 'Completed' || action.status === 'Cancelled') {
    return {
      status: 'completed',
      label: 'Completed',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      isDueOrOverdue: false,
      daysDiff: 0
    }
  }

  if (!action.due_date) {
    return {
      status: 'no-date',
      label: 'No Due Date',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      isDueOrOverdue: false,
      daysDiff: 999
    }
  }

  const today = startOfDay(new Date())
  const dueDate = startOfDay(parseISO(action.due_date))
  const diffDays = differenceInCalendarDays(dueDate, today)

  if (diffDays === 0) {
    return {
      status: 'due-today',
      label: 'Due Today',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold animate-pulse',
      isDueOrOverdue: true,
      daysDiff: 0
    }
  } else if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays)
    return {
      status: 'overdue',
      label: `${overdueDays}d Overdue`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      isDueOrOverdue: true,
      daysDiff: diffDays
    }
  } else if (diffDays <= 3) {
    return {
      status: 'due-soon',
      label: `Due in ${diffDays}d`,
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 font-semibold',
      isDueOrOverdue: false,
      daysDiff: diffDays
    }
  } else {
    return {
      status: 'upcoming',
      label: format(dueDate, 'MMM dd, yyyy'),
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      isDueOrOverdue: false,
      daysDiff: diffDays
    }
  }
}

/**
 * Filter list of actions into due / overdue / upcoming
 */
export const categorizeActions = (actions = []) => {
  const overdue = []
  const dueToday = []
  const dueSoon = []
  const pending = []
  const completed = []

  actions.forEach(action => {
    const info = getActionDueStatus(action)
    if (info.status === 'completed') {
      completed.push({ ...action, _dueInfo: info })
    } else {
      pending.push({ ...action, _dueInfo: info })
      if (info.status === 'overdue') overdue.push({ ...action, _dueInfo: info })
      else if (info.status === 'due-today') dueToday.push({ ...action, _dueInfo: info })
      else if (info.status === 'due-soon') dueSoon.push({ ...action, _dueInfo: info })
    }
  })

  return {
    overdue,
    dueToday,
    dueSoon,
    pending,
    completed,
    totalDueAlerts: overdue.length + dueToday.length
  }
}

/**
 * Trigger HTML5 Browser Notification if permitted
 */
export const sendBrowserNotification = (title, body, tag = 'cbi-task') => {
  if (typeof window === 'undefined' || !('Notification' in window)) return false

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/logo.png',
        tag,
        requireInteraction: true
      })
      return true
    } catch (e) {
      console.warn('Browser notification error:', e)
    }
  }
  return false
}

/**
 * Play a gentle alert tone using Web Audio API (no external file needed)
 */
export const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12) // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch (_) {}
}
