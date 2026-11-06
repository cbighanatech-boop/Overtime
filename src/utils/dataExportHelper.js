import * as XLSX from 'xlsx'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'
import { 
  isEligibleForLeave, 
  calculateAnnualLeaveEntitlement, 
  parseEngagementDate, 
  getTenureYears 
} from './leaveHelpers'

/**
 * Helper to paginate through all rows of a Supabase table (bypassing the 1,000 row PostgREST limit)
 */
async function fetchAllRecords(table, selectQuery = '*', orderColumn = 'id', ascending = false) {
  let allRows = []
  let from = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select(selectQuery)
      .order(orderColumn, { ascending })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (data && data.length > 0) {
      allRows = allRows.concat(data)
      from += pageSize
      if (data.length < pageSize) hasMore = false
    } else {
      hasMore = false
    }
  }
  return allRows
}

/**
 * Compute auto-fitted column widths for a JSON worksheet
 */
function autoFitColumns(rows) {
  if (!rows || rows.length === 0) return []
  const keys = Object.keys(rows[0])
  return keys.map(key => {
    let maxLen = key.length
    for (let i = 0; i < Math.min(rows.length, 200); i++) {
      const val = rows[i][key]
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length)
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 50) }
  })
}

/**
 * Format timestamp into YYYY-MM-DD HH:MM:SS
 */
function formatDateTime(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

/**
 * Format date into YYYY-MM-DD
 */
function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  return d.toISOString().substring(0, 10)
}

// =========================================================================
// 1. EXTRACT ALL DATA POINTS: CBI LEAVE MANAGEMENT APP
// =========================================================================

export const exportLeaveAppData = async ({ currentYear = new Date().getFullYear() } = {}) => {
  const toastId = toast.loading('Extracting all Leave App data points...')

  try {
    // 1. Fetch departments map
    const { data: deptData, error: deptErr } = await supabase
      .from('departments')
      .select('id, name')
      .order('name')
    if (deptErr) throw deptErr
    const deptMap = new Map((deptData || []).map(d => [d.id, d.name]))

    // 2. Fetch leave types
    const { data: ltData, error: ltErr } = await supabase
      .from('leave_types')
      .select('*')
      .order('name')
    if (ltErr) throw ltErr
    const ltMap = new Map((ltData || []).map(lt => [lt.id, lt]))

    // 3. Fetch all eligible profiles
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select(`
        id,
        staff_id,
        full_name,
        email,
        role,
        department_id,
        hourly_rate,
        date_of_engagement,
        native_status,
        company,
        is_active,
        departments (id, name)
      `)
      .order('full_name')
    if (profErr) throw profErr

    // Profile lookup maps
    const profileById = new Map()
    const profileByStaffId = new Map()
    const profileByName = new Map()
    for (const p of profiles || []) {
      profileById.set(p.id, p)
      if (p.staff_id) profileByStaffId.set(p.staff_id, p)
      if (p.full_name) profileByName.set(p.full_name.toLowerCase().trim(), p)
    }

    // Hourly rate fallback from overtime records
    const { data: otRates } = await supabase
      .from('overtime_records')
      .select('employee_id, employee_name, hourly_rate, captured_at')
      .gt('hourly_rate', 0)
      .order('captured_at', { ascending: false })

    const otRateById = new Map()
    const otRateByName = new Map()
    for (const r of otRates || []) {
      if (r.employee_id && !otRateById.has(r.employee_id)) {
        otRateById.set(r.employee_id, Number(r.hourly_rate))
      }
      if (r.employee_name && !otRateByName.has(r.employee_name.toLowerCase().trim())) {
        otRateByName.set(r.employee_name.toLowerCase().trim(), Number(r.hourly_rate))
      }
    }

    (profiles || []).forEach(p => {
      let rate = Number(p.hourly_rate || 0)
      if (rate === 0) {
        const fallback = otRateById.get(p.staff_id) || 
                         otRateById.get(p.id) || 
                         otRateByName.get((p.full_name || '').toLowerCase().trim())
        if (fallback) p.hourly_rate = fallback
      }
    })

    const eligibleActive = (profiles || []).filter(p => isEligibleForLeave(p) && p.is_active)

    // 4. Fetch all leave requests (paginated)
    const leaveRequests = await fetchAllRecords('leave_requests', '*', 'start_date', false)

    // 5. Fetch all leave balances (paginated)
    let leaveBalances = []
    try {
      leaveBalances = await fetchAllRecords('leave_balances', '*', 'year', false)
    } catch (e) {
      console.warn('Could not fetch leave_balances:', e)
    }

    // 6. Fetch leave audit logs (if table exists)
    let leaveAudit = []
    try {
      const { data: auditData } = await supabase
        .from('leave_audit_logs')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(2000)
      leaveAudit = auditData || []
    } catch (e) {
      // Table may be empty or unconfigured
    }

    // -------------------------------------------------------------
    // SHEET 1: LEAVE REQUESTS (ALL APPLICATIONS)
    // -------------------------------------------------------------
    const requestsSheetData = (leaveRequests || []).map(req => {
      const emp = profileById.get(req.employee_id) || 
                  profileByStaffId.get(req.employee_id) || 
                  profileByName.get((req.employee_name || '').toLowerCase().trim())
      const lt = ltMap.get(req.leave_type_id)
      const deptName = req.department_id ? deptMap.get(req.department_id) : (emp?.departments?.name || '—')
      const reviewer = req.reviewed_by ? (profileById.get(req.reviewed_by)?.full_name || req.reviewed_by) : '—'
      const capturer = req.captured_by ? (profileById.get(req.captured_by)?.full_name || req.captured_by) : '—'

      const hourlyRate = Number(emp?.hourly_rate || 0)
      const dayValue = hourlyRate * 8
      const days = Number(req.total_days || 0)
      const estimatedCost = days * dayValue

      return {
        'Request ID': req.id,
        'Staff ID': emp?.staff_id || req.employee_id || '—',
        'Employee Name': req.employee_name || emp?.full_name || '—',
        'Department': deptName,
        'Leave Type': lt?.name || 'Annual Leave',
        'Start Date': formatDate(req.start_date),
        'End Date': formatDate(req.end_date),
        'Total Working Days': days,
        'Status': req.status,
        'Estimated Cost (GHS)': Number(estimatedCost.toFixed(2)),
        'Hourly Rate (GHS)': Number(hourlyRate.toFixed(2)),
        'Reason / Purpose': req.reason || '—',
        'Handover Notes': req.handover_notes || '—',
        'Relief Staff': req.relief_staff_name || '—',
        'Contact Phone While Away': req.contact_phone || '—',
        'Captured By': capturer,
        'Date Applied': formatDateTime(req.captured_at),
        'Reviewed By': reviewer,
        'Reviewer Remarks': req.review_comment || '—',
        'Date Reviewed': formatDateTime(req.reviewed_at),
        'Last Updated': formatDateTime(req.updated_at)
      }
    })

    // -------------------------------------------------------------
    // SHEET 2: STAFF LEAVE BALANCES & ENTITLEMENTS (ALL ELIGIBLE STAFF)
    // -------------------------------------------------------------
    // Calculate approved used days for currentYear
    const usedDaysByStaff = new Map()
    ;(leaveRequests || []).forEach(req => {
      const isAnnual = (ltMap.get(req.leave_type_id)?.name || '').trim().toLowerCase() === 'annual leave'
      const reqYear = new Date(req.start_date).getFullYear()
      if (req.status === 'Approved' && isAnnual && reqYear === currentYear) {
        const staffKey = (req.employee_id || '').trim()
        const nameKey = (req.employee_name || '').toLowerCase().trim()
        usedDaysByStaff.set(staffKey, (usedDaysByStaff.get(staffKey) || 0) + Number(req.total_days || 0))
        if (nameKey) usedDaysByStaff.set(nameKey, (usedDaysByStaff.get(nameKey) || 0) + Number(req.total_days || 0))
      }
    })

    const balancesSheetData = eligibleActive.map(emp => {
      const parsedDoe = parseEngagementDate(emp.date_of_engagement)
      const isNonNative = (emp.native_status || '').toLowerCase() === 'non-native'
      const baseDays = isNonNative ? 24 : 21
      const monthlyRate = isNonNative ? 2.0 : 1.75
      const tenureYrs = getTenureYears(emp, currentYear)

      let bonusDays = 0
      if (tenureYrs === 3 || tenureYrs === 4) bonusDays = 3
      else if (tenureYrs >= 5) bonusDays = 4

      const isProrated = parsedDoe?.year === currentYear
      const monthsToEndOfYear = isProrated ? Math.max(0, 12 - parsedDoe.month + 1) : 12

      const entitledDays = calculateAnnualLeaveEntitlement(emp, currentYear)
      const usedDays = usedDaysByStaff.get(emp.staff_id) || usedDaysByStaff.get(emp.full_name?.toLowerCase().trim()) || 0
      const remainingDays = Math.max(0, Number((entitledDays - usedDays).toFixed(2)))
      const utilPct = entitledDays > 0 ? Number(((usedDays / entitledDays) * 100).toFixed(1)) : 0

      const hourlyRate = Number(emp.hourly_rate || 0)
      const dayValue = hourlyRate * 8
      const entitledCost = Number((entitledDays * dayValue).toFixed(2))
      const usedCost = Number((usedDays * dayValue).toFixed(2))
      const remainingCost = Number((remainingDays * dayValue).toFixed(2))

      return {
        'Year': currentYear,
        'Staff ID': emp.staff_id,
        'Employee Name': emp.full_name,
        'Department': emp.departments?.name || deptMap.get(emp.department_id) || '—',
        'Company': emp.company || 'CBI',
        'Date of Engagement (DOE)': emp.date_of_engagement ? formatDate(emp.date_of_engagement) : 'Not Provided',
        'Origin / Status': isNonNative ? 'Non-Native' : 'Native',
        'Tenure (Years)': tenureYrs !== null && tenureYrs !== undefined ? tenureYrs : '—',
        'Base Annual Days': baseDays,
        'Monthly Accrual Factor': monthlyRate,
        'Prorated Current Year': isProrated ? `Yes (${monthsToEndOfYear} mos to year-end)` : 'No',
        'Anniversary Bonus Days': bonusDays,
        'Total Entitled Days': entitledDays,
        'Approved Days Used': usedDays,
        'Remaining Days Balance': remainingDays,
        'Days Utilization %': utilPct,
        'Hourly Rate (GHS)': Number(hourlyRate.toFixed(2)),
        'Day Value 8hrs (GHS)': Number(dayValue.toFixed(2)),
        'Total Entitled Liability (GHS)': entitledCost,
        'Incurred Cost Taken (GHS)': usedCost,
        'Remaining Liability (GHS)': remainingCost
      }
    })

    // -------------------------------------------------------------
    // SHEET 3: DEPARTMENTAL SUMMARY & FINANCIAL VALUATION
    // -------------------------------------------------------------
    const deptSummaryMap = new Map()
    for (const d of deptData || []) {
      deptSummaryMap.set(d.id, {
        deptName: d.name,
        deptCode: d.name.substring(0, 4).toUpperCase(),
        headcount: 0,
        entitledDays: 0,
        usedDays: 0,
        remainingDays: 0,
        entitledCost: 0,
        usedCost: 0,
        remainingCost: 0
      })
    }

    balancesSheetData.forEach(row => {
      const emp = profileByStaffId.get(row['Staff ID'])
      const deptId = emp?.department_id
      if (deptId && deptSummaryMap.has(deptId)) {
        const d = deptSummaryMap.get(deptId)
        d.headcount += 1
        d.entitledDays += row['Total Entitled Days']
        d.usedDays += row['Approved Days Used']
        d.remainingDays += row['Remaining Days Balance']
        d.entitledCost += row['Total Entitled Liability (GHS)']
        d.usedCost += row['Incurred Cost Taken (GHS)']
        d.remainingCost += row['Remaining Liability (GHS)']
      }
    })

    const departmentSheetData = []
    deptSummaryMap.forEach(d => {
      if (d.headcount > 0 || d.usedDays > 0) {
        const utilPct = d.entitledDays > 0 ? Number(((d.usedDays / d.entitledDays) * 100).toFixed(1)) : 0
        const costUtilPct = d.entitledCost > 0 ? Number(((d.usedCost / d.entitledCost) * 100).toFixed(1)) : 0
        departmentSheetData.push({
          'Department': d.deptName,
          'Department Code': d.deptCode,
          'Active Headcount': d.headcount,
          'Total Entitled Days': Number(d.entitledDays.toFixed(2)),
          'Approved Days Used': Number(d.usedDays.toFixed(2)),
          'Remaining Days Balance': Number(d.remainingDays.toFixed(2)),
          'Days Utilization %': utilPct,
          'Total Entitled Liability (GHS)': Number(d.entitledCost.toFixed(2)),
          'Incurred Cost Taken (GHS)': Number(d.usedCost.toFixed(2)),
          'Remaining Liability (GHS)': Number(d.remainingCost.toFixed(2)),
          'Cost Utilization %': costUtilPct
        })
      }
    })
    departmentSheetData.sort((a, b) => b['Total Entitled Days'] - a['Total Entitled Days'])

    // -------------------------------------------------------------
    // SHEET 4: LEAVE TYPES & POLICIES
    // -------------------------------------------------------------
    const leaveTypesSheetData = (ltData || []).map(lt => ({
      'Leave Type ID': lt.id,
      'Leave Type Name': lt.name,
      'Default Statutory Days': lt.default_days || 0,
      'Description & Policy': lt.description || '—',
      'Created At': formatDateTime(lt.created_at)
    }))

    // -------------------------------------------------------------
    // SHEET 5: LEAVE AUDIT TRAIL
    // -------------------------------------------------------------
    const auditSheetData = (leaveAudit || []).map(a => ({
      'Audit ID': a.id,
      'Action': a.action,
      'Performed By': a.performed_by,
      'Date / Time': formatDateTime(a.performed_at),
      'Details': typeof a.details === 'object' ? JSON.stringify(a.details) : String(a.details || '—')
    }))

    // Construct Workbook
    const wb = XLSX.utils.book_new()

    // 1. Leave Requests
    const wsRequests = XLSX.utils.json_to_sheet(requestsSheetData.length ? requestsSheetData : [{ 'Status': 'No leave requests recorded' }])
    wsRequests['!cols'] = autoFitColumns(requestsSheetData)
    XLSX.utils.book_append_sheet(wb, wsRequests, 'Leave Requests')

    // 2. Staff Leave Balances
    const wsBalances = XLSX.utils.json_to_sheet(balancesSheetData.length ? balancesSheetData : [{ 'Status': 'No balance records' }])
    wsBalances['!cols'] = autoFitColumns(balancesSheetData)
    XLSX.utils.book_append_sheet(wb, wsBalances, 'Staff Leave Balances')

    // 3. Department Summary
    const wsDept = XLSX.utils.json_to_sheet(departmentSheetData.length ? departmentSheetData : [{ 'Status': 'No departmental data' }])
    wsDept['!cols'] = autoFitColumns(departmentSheetData)
    XLSX.utils.book_append_sheet(wb, wsDept, 'Departmental Summary')

    // 4. Leave Types
    const wsTypes = XLSX.utils.json_to_sheet(leaveTypesSheetData)
    wsTypes['!cols'] = autoFitColumns(leaveTypesSheetData)
    XLSX.utils.book_append_sheet(wb, wsTypes, 'Leave Types & Policy')

    // 5. Audit Trail
    if (auditSheetData.length > 0) {
      const wsAudit = XLSX.utils.json_to_sheet(auditSheetData)
      wsAudit['!cols'] = autoFitColumns(auditSheetData)
      XLSX.utils.book_append_sheet(wb, wsAudit, 'Leave Audit Trail')
    }

    // Write file
    const dateStamp = new Date().toISOString().slice(0, 10)
    const fileName = `CBI_Leave_Management_Full_Export_${currentYear}_${dateStamp}.xlsx`
    XLSX.writeFile(wb, fileName)

    toast.success(`Exported ${requestsSheetData.length} requests and ${balancesSheetData.length} staff records to Excel!`, { id: toastId })
    return true
  } catch (err) {
    console.error('Leave App Excel export error:', err)
    toast.error(`Export failed: ${err.message || 'Unknown error'}`, { id: toastId })
    return false
  }
}

// =========================================================================
// 2. EXTRACT ALL DATA POINTS: CBI OVERTIME MANAGEMENT APP
// =========================================================================

export const exportOvertimeAppData = async () => {
  const toastId = toast.loading('Extracting all Overtime App data points...')

  try {
    // 1. Fetch departments map
    const { data: deptData, error: deptErr } = await supabase
      .from('departments')
      .select('id, name')
      .order('name')
    if (deptErr) throw deptErr
    const deptMap = new Map((deptData || []).map(d => [d.id, d.name]))

    // 2. Fetch all employee profiles (paginated)
    const profiles = await fetchAllRecords('profiles', '*', 'full_name', true)
    const profileById = new Map()
    const profileByStaffId = new Map()
    for (const p of profiles || []) {
      profileById.set(p.id, p)
      if (p.staff_id) profileByStaffId.set(p.staff_id, p)
    }

    // 3. Fetch all overtime records (paginated)
    const overtimeRecords = await fetchAllRecords('overtime_records', '*', 'work_date', false)

    // 4. Fetch all extra hours records (paginated)
    let extraHours = []
    try {
      extraHours = await fetchAllRecords('extra_hours', '*', 'created_at', false)
    } catch (e) {
      console.warn('Could not fetch extra_hours:', e)
    }

    // 5. Fetch holidays
    let holidays = []
    try {
      const { data: hData } = await supabase
        .from('holidays')
        .select('*')
        .order('holiday_date', { ascending: true })
      holidays = hData || []
    } catch (e) {
      // Ignore
    }

    // 6. Fetch audit logs (up to 5,000)
    let auditLogs = []
    try {
      const { data: aData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(5000)
      auditLogs = aData || []
    } catch (e) {
      // Ignore
    }

    // -------------------------------------------------------------
    // SHEET 1: OVERTIME RECORDS (ALL LOGGED OVERTIME)
    // -------------------------------------------------------------
    const otSheetData = (overtimeRecords || []).map(rec => {
      const emp = profileById.get(rec.employee_id) || profileByStaffId.get(rec.employee_id)
      const deptName = rec.department_id ? deptMap.get(rec.department_id) : (emp?.departments?.name || '—')
      const reviewer = rec.reviewed_by ? (profileById.get(rec.reviewed_by)?.full_name || rec.reviewed_by) : '—'
      const capturer = rec.captured_by ? (profileById.get(rec.captured_by)?.full_name || rec.captured_by) : '—'

      const hourlyRate = Number(rec.hourly_rate || 0)
      const multiplier = Number(rec.rate_multiplier || 1.5)
      const otHours = Number(rec.overtime_hours || 0)
      const payout = rec.estimated_payout !== undefined && rec.estimated_payout !== null 
        ? Number(Number(rec.estimated_payout).toFixed(2))
        : Number((otHours * hourlyRate * multiplier).toFixed(2))

      return {
        'Record ID': rec.id,
        'Staff ID': emp?.staff_id || rec.employee_id || '—',
        'Employee Name': rec.employee_name || emp?.full_name || '—',
        'Department': deptName,
        'Shift Date': formatDate(rec.work_date),
        'Shift Type': rec.shift_type || 'Day',
        'Time In': rec.time_in ? String(rec.time_in).slice(0, 5) : '—',
        'Time Out': rec.time_out ? String(rec.time_out).slice(0, 5) : '—',
        'Break Hours': Number(rec.break_hours || 0),
        'Full Shift Work': rec.full_work ? 'Yes' : 'No',
        'Overtime Hours': otHours,
        'Multiplier Rate': `${multiplier}x`,
        'Hourly Rate (GHS)': hourlyRate,
        'Total Payout (GHS)': payout,
        'Overtime Reason': rec.reason || '—',
        'Task Description': rec.description || '—',
        'Status': rec.status || 'Pending',
        'Captured By': capturer,
        'Date Captured': formatDateTime(rec.captured_at),
        'Reviewed By': reviewer,
        'Reviewer Notes': rec.comments || '—',
        'Date Reviewed': formatDateTime(rec.reviewed_at),
        'Review Deadline': formatDateTime(rec.review_deadline),
        'Last Updated': formatDateTime(rec.updated_at)
      }
    })

    // -------------------------------------------------------------
    // SHEET 2: EXTRA HOURS RECORDS
    // -------------------------------------------------------------
    const extraHoursSheetData = (extraHours || []).map(eh => {
      const deptName = eh.department_id ? deptMap.get(eh.department_id) : '—'
      const approver = eh.approved_by ? (profileById.get(eh.approved_by)?.full_name || eh.approved_by) : '—'
      const capturer = eh.created_by ? (profileById.get(eh.created_by)?.full_name || eh.created_by) : '—'

      return {
        'Entry ID': eh.id,
        'Staff ID': eh.staff_id || '—',
        'Employee Name': eh.employee_name || '—',
        'Department': deptName,
        'Entry Month': eh.entry_month || '—',
        'Entry Year': eh.entry_year || '—',
        'Hours Assigned': Number(eh.hours_assigned || 0),
        'Hourly Rate (GHS)': Number(eh.hourly_rate || 0),
        'Total Cost (GHS)': Number(Number(eh.total_cost || 0).toFixed(2)),
        'Status': eh.status || 'Pending',
        'Approved By': approver,
        'Date Approved': formatDateTime(eh.approved_at),
        'Notes / Reason': eh.notes || '—',
        'Created By': capturer,
        'Created At': formatDateTime(eh.created_at)
      }
    })

    // -------------------------------------------------------------
    // SHEET 3: DEPARTMENTAL OVERTIME SUMMARY
    // -------------------------------------------------------------
    const deptSummaryMap = new Map()
    for (const d of deptData || []) {
      deptSummaryMap.set(d.id, {
        deptName: d.name,
        deptCode: d.name.substring(0, 4).toUpperCase(),
        totalRecords: 0,
        totalHours: 0,
        totalPayout: 0,
        approvedRecords: 0,
        approvedHours: 0,
        approvedPayout: 0,
        pendingRecords: 0,
        pendingHours: 0,
        pendingPayout: 0,
        declinedRecords: 0
      })
    }

    otSheetData.forEach(row => {
      const emp = profileByStaffId.get(row['Staff ID'])
      const deptId = emp?.department_id
      if (deptId && deptSummaryMap.has(deptId)) {
        const d = deptSummaryMap.get(deptId)
        d.totalRecords += 1
        d.totalHours += row['Overtime Hours']
        d.totalPayout += row['Total Payout (GHS)']

        if (row['Status'] === 'Approved') {
          d.approvedRecords += 1
          d.approvedHours += row['Overtime Hours']
          d.approvedPayout += row['Total Payout (GHS)']
        } else if (row['Status'] === 'Pending') {
          d.pendingRecords += 1
          d.pendingHours += row['Overtime Hours']
          d.pendingPayout += row['Total Payout (GHS)']
        } else if (row['Status'] === 'Declined') {
          d.declinedRecords += 1
        }
      }
    })

    const departmentSheetData = []
    deptSummaryMap.forEach(d => {
      if (d.totalRecords > 0) {
        departmentSheetData.push({
          'Department': d.deptName,
          'Department Code': d.deptCode,
          'Total Records Captured': d.totalRecords,
          'Total Overtime Hours': Number(d.totalHours.toFixed(1)),
          'Total Payout (GHS)': Number(d.totalPayout.toFixed(2)),
          'Approved Records': d.approvedRecords,
          'Approved Hours': Number(d.approvedHours.toFixed(1)),
          'Approved Payout (GHS)': Number(d.approvedPayout.toFixed(2)),
          'Pending Records': d.pendingRecords,
          'Pending Hours': Number(d.pendingHours.toFixed(1)),
          'Pending Payout (GHS)': Number(d.pendingPayout.toFixed(2)),
          'Declined Records': d.declinedRecords
        })
      }
    })
    departmentSheetData.sort((a, b) => b['Total Payout (GHS)'] - a['Total Payout (GHS)'])

    // -------------------------------------------------------------
    // SHEET 4: EMPLOYEE DIRECTORY & RATES
    // -------------------------------------------------------------
    const employeesSheetData = (profiles || []).map(p => ({
      'Profile ID': p.id,
      'Staff ID': p.staff_id || '—',
      'Full Name': p.full_name,
      'Email': p.email,
      'Department': p.department_id ? deptMap.get(p.department_id) : '—',
      'Role': p.role || 'employee',
      'Position / Title': p.position || '—',
      'Employment Category': p.category || '—',
      'Base Hourly Rate (GHS)': Number(p.hourly_rate || 0),
      'Date of Engagement': p.date_of_engagement ? formatDate(p.date_of_engagement) : '—',
      'Origin / Status': p.native_status || 'Native',
      'Company': p.company || 'CBI',
      'Account Status': p.is_active ? 'Active' : 'Inactive',
      'Created At': formatDateTime(p.created_at)
    }))

    // -------------------------------------------------------------
    // SHEET 5: PUBLIC HOLIDAYS
    // -------------------------------------------------------------
    const holidaysSheetData = (holidays || []).map(h => ({
      'Holiday ID': h.id,
      'Holiday Name': h.name,
      'Holiday Date': formatDate(h.holiday_date),
      'Created At': formatDateTime(h.created_at)
    }))

    // -------------------------------------------------------------
    // SHEET 6: SYSTEM AUDIT TRAIL
    // -------------------------------------------------------------
    const auditSheetData = (auditLogs || []).map(a => ({
      'Audit ID': a.id,
      'Action / Event': a.action || '—',
      'Performed By': a.performed_by || '—',
      'Date / Time': formatDateTime(a.performed_at),
      'Details': typeof a.details === 'object' ? JSON.stringify(a.details) : String(a.details || '—')
    }))

    // Construct Workbook
    const wb = XLSX.utils.book_new()

    // 1. Overtime Records
    const wsOt = XLSX.utils.json_to_sheet(otSheetData.length ? otSheetData : [{ 'Status': 'No overtime records found' }])
    wsOt['!cols'] = autoFitColumns(otSheetData)
    XLSX.utils.book_append_sheet(wb, wsOt, 'Overtime Records')

    // 2. Extra Hours Records
    if (extraHoursSheetData.length > 0) {
      const wsExtra = XLSX.utils.json_to_sheet(extraHoursSheetData)
      wsExtra['!cols'] = autoFitColumns(extraHoursSheetData)
      XLSX.utils.book_append_sheet(wb, wsExtra, 'Extra Hours Records')
    }

    // 3. Department Summary
    const wsDept = XLSX.utils.json_to_sheet(departmentSheetData.length ? departmentSheetData : [{ 'Status': 'No departmental data' }])
    wsDept['!cols'] = autoFitColumns(departmentSheetData)
    XLSX.utils.book_append_sheet(wb, wsDept, 'Departmental Overtime Summary')

    // 4. Employee Directory
    const wsEmp = XLSX.utils.json_to_sheet(employeesSheetData)
    wsEmp['!cols'] = autoFitColumns(employeesSheetData)
    XLSX.utils.book_append_sheet(wb, wsEmp, 'Employee Directory & Rates')

    // 5. Holidays
    if (holidaysSheetData.length > 0) {
      const wsHol = XLSX.utils.json_to_sheet(holidaysSheetData)
      wsHol['!cols'] = autoFitColumns(holidaysSheetData)
      XLSX.utils.book_append_sheet(wb, wsHol, 'Holidays Calendar')
    }

    // 6. Audit Trail
    if (auditSheetData.length > 0) {
      const wsAudit = XLSX.utils.json_to_sheet(auditSheetData)
      wsAudit['!cols'] = autoFitColumns(auditSheetData)
      XLSX.utils.book_append_sheet(wb, wsAudit, 'System Audit Trail')
    }

    // Write file
    const dateStamp = new Date().toISOString().slice(0, 10)
    const fileName = `CBI_Overtime_Management_Full_Export_${dateStamp}.xlsx`
    XLSX.writeFile(wb, fileName)

    toast.success(`Exported ${otSheetData.length} overtime records across ${departmentSheetData.length} departments to Excel!`, { id: toastId })
    return true
  } catch (err) {
    console.error('Overtime App Excel export error:', err)
    toast.error(`Export failed: ${err.message || 'Unknown error'}`, { id: toastId })
    return false
  }
}

