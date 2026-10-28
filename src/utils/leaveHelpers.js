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
 * Rule: Exclude employees whose company is "Abanach".
 * Returns true if employee is eligible for the Leave App (e.g. CBI staff).
 */
export const isEligibleForLeave = (employee) => {
  if (!employee) return false
  const company = employee.company?.toString().trim().toLowerCase()
  return company !== 'abanach'
}

/**
 * Calculate working days between two dates (inclusive),
 * EXCLUDING weekends (Saturday/Sunday) AND registered official holidays.
 * 
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {string} endDateStr - YYYY-MM-DD
 * @param {Array<string>} holidayDates - Array of 'YYYY-MM-DD' holiday date strings
 */
export const calculateWorkingDays = (startDateStr, endDateStr, holidayDates = []) => {
  if (!startDateStr || !endDateStr) return 0
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0

  // Normalize holiday dates to YYYY-MM-DD set for fast O(1) lookup
  const holidaySet = new Set(
    holidayDates.map(h => (typeof h === 'string' ? h.slice(0, 10) : h))
  )

  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dayOfWeek = cur.getDay()
    const curStr = cur.toISOString().split('T')[0]

    // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = holidaySet.has(curStr)

    // Only count if it's NOT a weekend and NOT a public holiday
    if (!isWeekend && !isHoliday) {
      count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * Returns any registered holidays that fall within a given date range
 */
export const getHolidaysInRange = (startDateStr, endDateStr, holidaysList = []) => {
  if (!startDateStr || !endDateStr || !holidaysList?.length) return []
  return holidaysList.filter(h => {
    const d = typeof h === 'string' ? h : h.holiday_date
    return d && d >= startDateStr && d <= endDateStr
  })
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
