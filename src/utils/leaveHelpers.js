import { isAdmin, isRep, isSupervisor } from './roleHelpers'

/**
 * Default leave types used as fallback or initial reference
 */
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', default_days: 21, description: 'Standard annual statutory holiday entitlement (Computed by Native status & DOE)' },
  { name: 'Sick Leave', default_days: 10, description: 'Medical or illness-related absence' },
  { name: 'Casual Leave', default_days: 5, description: 'Short-term personal urgent matters' },
  { name: 'Maternity Leave', default_days: 90, description: 'Maternity leave for female employees' },
  { name: 'Paternity Leave', default_days: 5, description: 'Paternity leave for male employees' },
  { name: 'Compassionate Leave', default_days: 5, description: 'Bereavement or compassionate family emergency' },
  { name: 'Study Leave', default_days: 5, description: 'Examinations and approved educational development' }
]

/**
 * Supported years for the Leave Management App (2024 through 2035)
 */
export const LEAVE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]

/**
 * Parse and normalize date into YYYY-MM-DD string, supporting Excel serial numbers and date objects
 */
export const normalizeDateString = (val) => {
  if (!val) return ''
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10)
  }
  if (typeof val === 'number') {
    // Excel serial number (base date 1899-12-30)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const jsDate = new Date(excelEpoch.getTime() + val * 86400000)
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString().slice(0, 10)
    }
  }
  const str = String(val).trim()
  if (!str) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }
  const parts = str.split(/[\/\-\.]/)
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    } else if (parts[2].length === 4) {
      const day = parts[0].padStart(2, '0')
      const month = parts[1].padStart(2, '0')
      const year = parts[2]
      return `${year}-${month}-${day}`
    }
  }
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return str
}

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
 * Check if the user is authorized to APPROVE a leave request.
 * Rule: When an employee exceeds the limit of their leave entitlement,
 * the Supervisor CANNOT approve - ONLY the Admin User can.
 */
export const canApproveLeave = (profile, leaveRequest, isOverLimit = false) => {
  if (!profile || !leaveRequest) return false
  if (isAdmin(profile)) return true
  if (isSupervisor(profile)) {
    // If request exceeds limit, Supervisor is blocked from approving
    if (isOverLimit) return false
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
 * Rule: Only CBI employees with a valid CBI ID (e.g. CBI/001, CBI-001, CBI001)
 * are eligible for leave days and displayed in the Leave App.
 * Employees with other ID formats or whose company is "Abanach" are strictly excluded.
 */
export const isEligibleForLeave = (employee) => {
  if (!employee) return false
  const company = employee.company?.toString().trim().toLowerCase()
  if (company === 'abanach') return false

  // Staff ID must exist and start with CBI (e.g. CBI/001, CBI-001, CBI_001, CBI001)
  const staffId = (employee.staff_id || employee.employee_id || '').toString().trim()
  if (!staffId) return false

  return /^CBI[/\\_ -]?[A-Z0-9]+/i.test(staffId)
}

/**
 * Parse and normalize Date of Engagement (DOE) supporting ISO, slash (M/D/YYYY or D/M/YYYY),
 * and Date objects into year, month (1-12), day, and normalized YYYY-MM-DD string.
 */
export const parseEngagementDate = (val) => {
  if (!val) return null
  if (val instanceof Date && !isNaN(val.getTime())) {
    return {
      year: val.getFullYear(),
      month: val.getMonth() + 1,
      day: val.getDate(),
      dateStr: val.toISOString().slice(0, 10)
    }
  }
  const str = String(val).trim()
  if (!str) return null
  
  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10)
    const day = parseInt(isoMatch[3], 10)
    return {
      year,
      month,
      day,
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // M/D/YYYY or MM/DD/YYYY or D/M/YYYY
  const slashMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/)
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10)
    const p2 = parseInt(slashMatch[2], 10)
    const year = parseInt(slashMatch[3], 10)
    let month = p1
    let day = p2
    if (p1 > 12) {
      day = p1
      month = p2
    }
    return {
      year,
      month,
      day,
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      dateStr: d.toISOString().slice(0, 10)
    }
  }
  return null
}

/**
 * Calculate tenure in years from Date of Engagement (DOE) relative to a given year.
 */
export const getTenureYears = (employee, forYear = new Date().getFullYear()) => {
  const rawDoe = employee?.date_of_engagement || employee?.doe
  const parsed = parseEngagementDate(rawDoe)
  if (!parsed) return 0
  return Math.max(0, forYear - parsed.year)
}

/**
 * Compute Annual Leave Entitlement according to CBI policy:
 * 1. Base entitlement:
 *    - Native: 21 days
 *    - Non-Native: 24 days
 * 2. Prorated Entitlement when DOE is in the calculation year:
 *    - Rate: (baseDays / 12)
 *    - Multiplied by number of months from DOE to the end of the year: (12 - doeMonth + 1)
 *    - E.g. If DOE = 9/1/2026 (September), months to end of year = 4 (Sep, Oct, Nov, Dec).
 *      Entitled = (21/12) * 4 = 7 days.
 * 3. Tenure Bonus for employees engaged before the calculation year:
 *    - In the year where the employee has 3 or 4 years of service: +3 days
 *    - On the 5th anniversary year and onwards (>= 5 years): +4 days
 *    - Applicable to both Native and Non-Native employees
 * 
 * @param {Object} employee - Employee profile (has native_status and date_of_engagement)
 * @param {number} forYear - Calculation calendar year (defaults to current year)
 * @returns {number} Entitled annual leave days
 */
export const calculateAnnualLeaveEntitlement = (employee, forYear = new Date().getFullYear()) => {
  if (!employee) return 21

  // Check Native vs Non-Native
  const isNonNative = employee.native_status?.toString().trim().toLowerCase() === 'non-native'
  const baseDays = isNonNative ? 24 : 21

  const rawDoe = employee.date_of_engagement || employee.doe
  const parsedDoe = parseEngagementDate(rawDoe)

  if (parsedDoe) {
    const { year: doeYear, month: doeMonth } = parsedDoe

    // Case 1: Employee joined in the calculation year -> Prorated to end of year
    if (doeYear === forYear) {
      const monthsFromDoeToEndOfYear = Math.max(0, 12 - doeMonth + 1)
      const proratedDays = (baseDays / 12) * monthsFromDoeToEndOfYear
      return Math.round(proratedDays * 100) / 100
    }

    // Case 2: Employee not yet engaged in calculation year
    if (doeYear > forYear) {
      return 0
    }

    // Case 3: Employee engaged before calculation year -> Full base + tenure bonus
    const tenureYears = Math.max(0, forYear - doeYear)
    let bonusDays = 0
    if (tenureYears === 3 || tenureYears === 4) {
      bonusDays = 3
    } else if (tenureYears >= 5) {
      bonusDays = 4
    }
    return baseDays + bonusDays
  }

  return baseDays
}

/**
 * Calculate Annual Leave Entitlement specifically for the Team Leave Planner (/leave/planner).
 * In the planner, Reps and Supervisors plan the full annual leave entitlement for employees:
 * - Native: 21 days
 * - Non-Native: 24 days
 * - 3rd or 4th anniversary year (3-4 years tenure): +3 bonus days (total 24 or 27 days)
 * - 5th or more anniversary year (>= 5 years tenure): +4 bonus days (total 25 or 28 days)
 * 
 * @param {Object} employee - Employee profile (has native_status and date_of_engagement)
 * @param {number} forYear - Planning calendar year
 * @returns {number} Full annual planner entitlement days
 */
export const calculatePlannerAnnualEntitlement = (employee, forYear = new Date().getFullYear()) => {
  if (!employee) return 21

  const isNonNative = employee.native_status?.toString().trim().toLowerCase() === 'non-native'
  const baseDays = isNonNative ? 24 : 21

  const tenureYears = getTenureYears(employee, forYear)
  let bonusDays = 0
  if (tenureYears === 3 || tenureYears === 4) {
    bonusDays = 3
  } else if (tenureYears >= 5) {
    bonusDays = 4
  }

  return baseDays + bonusDays
}

/**
 * Calculate Accumulated (Accrued) Leave Balance to date according to CBI policy:
 * - Rate: (baseDays / 12) per month
 * - For an employee joined in the current year:
 *   multiplied by the number of months spent in the company from DOE up to current date.
 *   E.g. If DOE = 9/1/2026, and current month is October (month 10):
 *   months spent = (10 - 9 + 1) = 2 months.
 *   accumulated = (21/12) * 2 = 3.5 days.
 * - For an employee joined prior to the current year:
 *   multiplied by months elapsed in the year so far (capped at full year entitlement).
 * 
 * @param {Object} employee - Employee profile
 * @param {number} forYear - Calculation year
 * @param {Date} asOfDate - Date as of which to calculate accrual (defaults to today)
 */
export const calculateAccumulatedLeave = (
  employee,
  forYear = new Date().getFullYear(),
  asOfDate = new Date()
) => {
  if (!employee) return { accumulatedDays: 0, monthsSpent: 0, ratePerMonth: 1.75, isProrated: false, monthsFromDoeToEndOfYear: 12 }

  const isNonNative = employee.native_status?.toString().trim().toLowerCase() === 'non-native'
  const baseDays = isNonNative ? 24 : 21
  const annualEntitled = calculateAnnualLeaveEntitlement(employee, forYear)
  const monthlyRate = baseDays / 12

  const rawDoe = employee.date_of_engagement || employee.doe
  const parsedDoe = parseEngagementDate(rawDoe)

  const asOfYear = asOfDate.getFullYear()
  const asOfMonth = asOfDate.getMonth() + 1

  // Past year: full entitlement for that year was earned
  if (forYear < asOfYear) {
    const isProrated = parsedDoe?.year === forYear
    const months = isProrated ? Math.max(0, 12 - parsedDoe.month + 1) : 12
    return {
      accumulatedDays: annualEntitled,
      monthsSpent: months,
      ratePerMonth: monthlyRate,
      isProrated,
      monthsFromDoeToEndOfYear: months
    }
  }

  // Future year: not accumulated yet
  if (forYear > asOfYear) {
    return {
      accumulatedDays: 0,
      monthsSpent: 0,
      ratePerMonth: monthlyRate,
      isProrated: parsedDoe?.year === forYear,
      monthsFromDoeToEndOfYear: parsedDoe?.year === forYear ? Math.max(0, 12 - parsedDoe.month + 1) : 12
    }
  }

  // forYear === asOfYear (current calendar year)
  if (!parsedDoe) {
    const monthsSpent = asOfMonth
    const accumulatedDays = Math.min(
      annualEntitled,
      Math.round((monthlyRate * monthsSpent) * 100) / 100
    )
    return {
      accumulatedDays,
      monthsSpent,
      ratePerMonth: monthlyRate,
      isProrated: false,
      monthsFromDoeToEndOfYear: 12
    }
  }

  const { year: doeYear, month: doeMonth } = parsedDoe

  if (doeYear > forYear) {
    return {
      accumulatedDays: 0,
      monthsSpent: 0,
      ratePerMonth: monthlyRate,
      isProrated: false,
      monthsFromDoeToEndOfYear: 0
    }
  }

  let monthsSpent = 0
  let isProrated = false
  let monthsFromDoeToEndOfYear = 12

  if (doeYear === forYear) {
    isProrated = true
    monthsFromDoeToEndOfYear = Math.max(0, 12 - doeMonth + 1)
    if (asOfMonth < doeMonth) {
      monthsSpent = 0
    } else {
      monthsSpent = asOfMonth - doeMonth + 1
    }
  } else {
    monthsSpent = asOfMonth
  }

  const accumulatedDays = Math.min(
    annualEntitled,
    Math.round((monthlyRate * monthsSpent) * 100) / 100
  )

  return {
    accumulatedDays,
    monthsSpent,
    ratePerMonth: monthlyRate,
    isProrated,
    monthsFromDoeToEndOfYear
  }
}

/**
 * Rule: Casual leave can only be utilized when the employee
 * has utilized all of his/her annual leave entitlement for the year.
 *
 * @param {number} annualEntitled - Total annual leave days entitled for the year
 * @param {number} annualUsed - Total approved annual leave days used in the year
 * @returns {{ canUtilize: boolean, remainingAnnualDays: number, reason: string }}
 */
export const canUtilizeCasualLeave = (annualEntitled, annualUsed) => {
  const remainingAnnual = Math.max(0, Number(annualEntitled || 0) - Number(annualUsed || 0))
  if (remainingAnnual > 0) {
    return {
      canUtilize: false,
      remainingAnnualDays: remainingAnnual,
      reason: `Casual leave can only be utilized when all Annual Leave entitlement for the year has been exhausted. Employee still has ${remainingAnnual} day(s) of Annual Leave remaining.`
    }
  }
  return {
    canUtilize: true,
    remainingAnnualDays: 0,
    reason: ''
  }
}

/**
 * Get entitlement breakdown explanation for tooltip / display
 */
export const getEntitlementBreakdown = (employee, leaveType, forYear = new Date().getFullYear()) => {
  if (!leaveType) return { entitled: 0, text: '', accumulatedDays: 0 }

  const typeName = (leaveType.name || '').trim().toLowerCase()
  if (typeName === 'annual leave') {
    const isNonNative = employee?.native_status?.toString().trim().toLowerCase() === 'non-native'
    const baseDays = isNonNative ? 24 : 21
    const tenureYears = getTenureYears(employee, forYear)
    const total = calculateAnnualLeaveEntitlement(employee, forYear)
    const bonusDays = Math.max(0, total - baseDays)
    const acc = calculateAccumulatedLeave(employee, forYear)

    let note = ''
    if (acc.isProrated) {
      note = `Prorated: ${total} days (${baseDays}/12 × ${acc.monthsFromDoeToEndOfYear} mos from DOE to year-end)`
    } else {
      note = `${baseDays} days base (${isNonNative ? 'Non-Native' : 'Native'})`
      if (bonusDays > 0) {
        note += ` + ${bonusDays} days tenure bonus (${tenureYears} yrs of service)`
      } else if (employee?.date_of_engagement) {
        note += ` (${tenureYears} yrs service)`
      }
    }

    return {
      entitled: total,
      baseDays,
      bonusDays,
      tenureYears,
      isNonNative,
      isProrated: acc.isProrated,
      monthsFromDoeToEndOfYear: acc.monthsFromDoeToEndOfYear,
      accumulatedDays: acc.accumulatedDays,
      monthsSpent: acc.monthsSpent,
      ratePerMonth: acc.ratePerMonth,
      text: note
    }
  }

  return {
    entitled: Number(leaveType.default_days || 0),
    baseDays: Number(leaveType.default_days || 0),
    bonusDays: 0,
    accumulatedDays: Number(leaveType.default_days || 0),
    text: `${leaveType.default_days || 0} days statutory`
  }
}

/**
 * Get entitlement for any leave type, automatically applying the DOE & Native formula for Annual Leave.
 */
export const getEmployeeLeaveEntitlement = (employee, leaveType, forYear = new Date().getFullYear()) => {
  if (!leaveType) return 0
  const typeName = (leaveType.name || '').trim().toLowerCase()
  if (typeName === 'annual leave') {
    return calculateAnnualLeaveEntitlement(employee, forYear)
  }
  return Number(leaveType.default_days || 0)
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
