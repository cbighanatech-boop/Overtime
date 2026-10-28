import { isAdmin, isRep, isSupervisor } from './roleHelpers'

/**
 * Default leave types used as fallback or initial reference
 */
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', default_days: 15, description: 'Standard annual statutory holiday entitlement' },
  { name: 'Sick Leave', default_days: 10, description: 'Medical or illness-related absence' },
  { name: 'Casual Leave', default_days: 5, description: 'Short-term personal urgent matters' },
  { name: 'Maternity Leave', default_days: 90, description: 'Maternity leave for female employees' },
  { name: 'Paternity Leave', default_days: 5, description: 'Paternity leave for male employees' },
  { name: 'Compassionate Leave', default_days: 5, description: 'Bereavement or compassionate family emergency' },
  { name: 'Study Leave', default_days: 5, description: 'Examinations and approved educational development' }
]

/**
 * Check if the user is authorized to place leave requests on behalf of employees.
 * Reps and Admins can place leave requests.
 */
export const canApplyLeave = (profile) => {
  return isAdmin(profile) || isRep(profile)
}

/**
 * Check if the user is authorized to review (approve/decline) leave requests.
 * Supervisors (for their department) and Admins (all).
 */
export const canReviewLeave = (profile, leaveRequest = null) => {
  if (!profile) return false
  if (isAdmin(profile)) return true
  if (isSupervisor(profile)) {
    if (!leaveRequest) return true
    // Supervisor can review if request is pending and in their department
    return (
      leaveRequest.status === 'Pending' &&
      leaveRequest.department_id === profile.department_id
    )
  }
  return false
}

/**
 * Check if user can cancel or edit a leave request
 */
export const canCancelLeave = (profile, leaveRequest) => {
  if (!profile || !leaveRequest) return false
  if (isAdmin(profile)) return true
  if (isRep(profile)) {
    return (
      leaveRequest.status === 'Pending' &&
      leaveRequest.department_id === profile.department_id
    )
  }
  return false
}

/**
 * Calculate working days between two dates (inclusive), excluding weekends (Sat/Sun).
 */
export const calculateWorkingDays = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return 0
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0

  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dayOfWeek = cur.getDay()
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * Status colors for leave badges
 */
export const LEAVE_STATUS_COLORS = {
  Pending: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500'
  },
  Approved: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500'
  },
  Declined: {
    bg: 'bg-rose-100',
    text: 'text-rose-800',
    border: 'border-rose-200',
    dot: 'bg-rose-500'
  },
  Cancelled: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    dot: 'bg-gray-500'
  }
}

