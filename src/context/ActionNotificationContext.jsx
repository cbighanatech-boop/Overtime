import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { isAdmin } from '../utils/roleHelpers'
import { 
  fetchAdminActions, 
  categorizeActions, 
  sendBrowserNotification,
  playNotificationSound 
} from '../utils/adminActionsService'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'

const ActionNotificationContext = createContext({})

export const ActionNotificationProvider = ({ children }) => {
  const { profile } = useAuth()
  const [actions, setActions] = useState([])
  const [summary, setSummary] = useState({
    overdue: [],
    dueToday: [],
    dueSoon: [],
    pending: [],
    completed: [],
    totalDueAlerts: 0
  })
  const [loading, setLoading] = useState(false)
  const [browserPermission, setBrowserPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  )
  const hasNotifiedRef = useRef(false)

  const loadActions = useCallback(async (isInitial = false) => {
    if (!profile || !isAdmin(profile)) return
    setLoading(true)

    try {
      const { actions: data } = await fetchAdminActions()
      setActions(data)
      const categorized = categorizeActions(data)
      setSummary(categorized)

      // Notify user on session start or when due actions are discovered
      if (isInitial && !hasNotifiedRef.current && categorized.totalDueAlerts > 0) {
        hasNotifiedRef.current = true
        const overdueCount = categorized.overdue.length
        const dueTodayCount = categorized.dueToday.length

        let msg = ''
        if (overdueCount > 0 && dueTodayCount > 0) {
          msg = `⚠️ ${dueTodayCount} action(s) due today & ${overdueCount} overdue!`
        } else if (dueTodayCount > 0) {
          msg = `🔔 ${dueTodayCount} action item(s) due today!`
        } else if (overdueCount > 0) {
          msg = `⚠️ ${overdueCount} action item(s) currently overdue!`
        }

        toast(msg, {
          icon: '📋',
          duration: 6000,
          style: {
            border: '2px solid #FDB913',
            padding: '14px',
            color: '#004D2A',
            fontWeight: '600'
          }
        })

        // Also fire desktop browser notification if granted
        if (Notification?.permission === 'granted') {
          sendBrowserNotification(
            'CBI Admin Action Alert',
            msg,
            'cbi-due-notification'
          )
        }
      }
    } catch (err) {
      console.error('Error in loadActions:', err)
    } finally {
      setLoading(false)
    }
  }, [profile])

  // Initial load
  useEffect(() => {
    if (profile && isAdmin(profile)) {
      loadActions(true)

      // Listen to Supabase real-time changes
      const channel = supabase
        .channel('admin-actions-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_actions' }, () => {
          loadActions(false)
        })
        .subscribe()

      // Poll every 5 minutes to detect day changes or newly due items
      const interval = setInterval(() => {
        loadActions(false)
      }, 5 * 60 * 1000)

      return () => {
        supabase.removeChannel(channel)
        clearInterval(interval)
      }
    }
  }, [profile, loadActions])

  // Request browser notification permission
  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Browser does not support desktop notifications.')
      return false
    }

    try {
      const result = await Notification.requestPermission()
      setBrowserPermission(result)
      if (result === 'granted') {
        toast.success('Desktop notifications enabled!')
        sendBrowserNotification(
          'CBI Notifications Activated',
          'You will receive instant alerts when action items reach their due dates.'
        )
        playNotificationSound()
        return true
      } else {
        toast.error('Notification permission was declined.')
        return false
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err)
      return false
    }
  }

  return (
    <ActionNotificationContext.Provider
      value={{
        actions,
        summary,
        loading,
        browserPermission,
        requestBrowserPermission,
        refreshActions: () => loadActions(false)
      }}
    >
      {children}
    </ActionNotificationContext.Provider>
  )
}

export const useActionNotifications = () => useContext(ActionNotificationContext)
