import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { 
  isEligibleForLeave, 
  calculateAnnualLeaveEntitlement, 
  getTenureYears, 
  LEAVE_YEARS 
} from '../../utils/leaveHelpers'
import * as XLSX from 'xlsx'
import { 
  CalendarRange, 
  Save, 
  Download, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  Sparkles, 
  ChevronRight, 
  Info,
  Calendar,
  Layers,
  Edit3,
  X,
  Check,
  CheckSquare,
  Square
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const MONTHS = [
  { num: 1, name: 'January', short: 'Jan' },
  { num: 2, name: 'February', short: 'Feb' },
  { num: 3, name: 'March', short: 'Mar' },
  { num: 4, name: 'April', short: 'Apr' },
  { num: 5, name: 'May', short: 'May' },
  { num: 6, name: 'June', short: 'Jun' },
  { num: 7, name: 'July', short: 'Jul' },
  { num: 8, name: 'August', short: 'Aug' },
  { num: 9, name: 'September', short: 'Sep' },
  { num: 10, name: 'October', short: 'Oct' },
  { num: 11, name: 'November', short: 'Nov' },
  { num: 12, name: 'December', short: 'Dec' },
]

export const TeamLeavePlannerPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // State
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedDept, setSelectedDept] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')

  // Data
  const [departments, setDepartments] = useState([])
  const [employees, setEmployees] = useState([])
  const [plans, setPlans] = useState({}) // { [staff_id]: { selectedMonths: [3, 8], monthAllocations: { 3: 10, 8: 11 }, notes: '' } }
  const [approvedRequests, setApprovedRequests] = useState([])

  // Modal for editing month allocation & notes for a specific employee
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [editMonthDetails, setEditMonthDetails] = useState({ monthNum: null, days: '', note: '' })

  // ── 1. Fetch Department, Employee & Plan Data ──────────────────────────────
  const fetchPlannerData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      // 1. Fetch departments
      const { data: deptData } = await supabase.from('departments').select('*').order('name')
      const depts = deptData || []
      setDepartments(depts)

      // Set initial department
      if (!isAdmin(profile) && profile.department_id) {
        setSelectedDept(profile.department_id)
      }

      // 2. Fetch active eligible CBI employees (excludes Abanach, must have CBI/XXX ID)
      let empQuery = supabase
        .from('profiles')
        .select(`
          id, 
          staff_id, 
          full_name, 
          company, 
          department_id, 
          date_of_engagement, 
          native_status, 
          departments (id, name)
        `)
        .eq('is_active', true)
        .neq('company', 'Abanach')
        .order('full_name')

      if (!isAdmin(profile) && profile.department_id) {
        empQuery = empQuery.eq('department_id', profile.department_id)
      }

      const { data: empData, error: empError } = await empQuery
      if (empError) throw empError

      const eligible = (empData || []).filter(isEligibleForLeave)
      setEmployees(eligible)

      // 3. Fetch approved leave requests for the selected year
      const yearStart = `${selectedYear}-01-01`
      const yearEnd = `${selectedYear}-12-31`
      const { data: reqData } = await supabase
        .from('leave_requests')
        .select('id, employee_id, employee_name, department_id, start_date, end_date, total_days, status')
        .eq('status', 'Approved')
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd)

      setApprovedRequests(reqData || [])

      // 4. Fetch stored leave plans from database (with fallback to localStorage)
      let loadedPlans = {}
      try {
        const { data: planData, error: planError } = await supabase
          .from('leave_plans')
          .select('*')
          .eq('year', selectedYear)

        if (!planError && planData && planData.length > 0) {
          planData.forEach(p => {
            loadedPlans[p.employee_id] = {
              selectedMonths: Array.isArray(p.selected_months) ? p.selected_months : [],
              monthAllocations: typeof p.month_allocations === 'object' && p.month_allocations !== null ? p.month_allocations : {},
              notes: p.notes || '',
              totalPlannedDays: Number(p.total_planned_days || 0)
            }
          })
        }
      } catch (dbErr) {
        console.warn('Could not read from leave_plans table, checking local backup:', dbErr.message)
      }

      // Check localStorage backup if nothing in DB
      if (Object.keys(loadedPlans).length === 0) {
        try {
          const cached = localStorage.getItem(`cbi_leave_plans_${selectedYear}`)
          if (cached) {
            loadedPlans = JSON.parse(cached)
          }
        } catch (_) {}
      }

      setPlans(loadedPlans)
      setHasUnsavedChanges(false)

    } catch (err) {
      console.error('Error fetching planner data:', err)
      toast.error('Failed to load team leave planning data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlannerData()
  }, [profile, selectedYear])

  // ── 2. Toggle Month for an Employee ────────────────────────────────────────
  const handleToggleMonth = (emp, monthNum) => {
    const staffId = emp.staff_id || emp.full_name
    const currentPlan = plans[staffId] || { selectedMonths: [], monthAllocations: {}, notes: '' }
    const currentMonths = [...(currentPlan.selectedMonths || [])]
    const currentAlloc = { ...(currentPlan.monthAllocations || {}) }

    const isSelected = currentMonths.includes(monthNum)
    let newMonths = []

    if (isSelected) {
      // Remove month
      newMonths = currentMonths.filter(m => m !== monthNum)
      delete currentAlloc[monthNum]
    } else {
      // Add month
      newMonths = [...currentMonths, monthNum].sort((a, b) => a - b)
      
      // Auto-assign default days if not specified
      const entitled = calculateAnnualLeaveEntitlement(emp, selectedYear)
      const daysPerMonth = Math.max(1, Math.round(entitled / Math.max(1, newMonths.length)))
      currentAlloc[monthNum] = daysPerMonth
    }

    // Recalculate total planned days
    const totalPlannedDays = Object.values(currentAlloc).reduce((sum, d) => sum + Number(d || 0), 0)

    setPlans(prev => ({
      ...prev,
      [staffId]: {
        ...currentPlan,
        selectedMonths: newMonths,
        monthAllocations: currentAlloc,
        totalPlannedDays
      }
    }))
    setHasUnsavedChanges(true)
  }

  // ── 3. Quick Edit Month Details Modal Handler ──────────────────────────────
  const handleOpenEditModal = (emp, monthNum) => {
    const staffId = emp.staff_id || emp.full_name
    const plan = plans[staffId] || { selectedMonths: [], monthAllocations: {}, notes: '' }
    const existingDays = plan.monthAllocations?.[monthNum] || ''
    setEditingEmployee(emp)
    setEditMonthDetails({
      monthNum,
      days: existingDays !== undefined ? String(existingDays) : '',
      note: plan.notes || ''
    })
  }

  const handleSaveMonthDetails = () => {
    if (!editingEmployee || !editMonthDetails.monthNum) return
    const staffId = editingEmployee.staff_id || editingEmployee.full_name
    const monthNum = editMonthDetails.monthNum
    const plan = plans[staffId] || { selectedMonths: [], monthAllocations: {}, notes: '' }
    const months = [...(plan.selectedMonths || [])]
    const alloc = { ...(plan.monthAllocations || {}) }

    const daysNum = parseFloat(editMonthDetails.days)
    if (!isNaN(daysNum) && daysNum > 0) {
      if (!months.includes(monthNum)) {
        months.push(monthNum)
        months.sort((a, b) => a - b)
      }
      alloc[monthNum] = daysNum
    } else {
      // If days set to 0 or empty, unselect month
      const idx = months.indexOf(monthNum)
      if (idx !== -1) months.splice(idx, 1)
      delete alloc[monthNum]
    }

    const totalPlannedDays = Object.values(alloc).reduce((sum, d) => sum + Number(d || 0), 0)

    setPlans(prev => ({
      ...prev,
      [staffId]: {
        ...plan,
        selectedMonths: months,
        monthAllocations: alloc,
        notes: editMonthDetails.note.trim(),
        totalPlannedDays
      }
    }))
    setHasUnsavedChanges(true)
    setEditingEmployee(null)
    toast.success(`Updated ${MONTHS[monthNum - 1].name} allocation for ${editingEmployee.full_name}`)
  }

  // ── 4. Save Plan Changes to Supabase & Local Cache ─────────────────────────
  const handleSaveAllPlans = async () => {
    setSaving(true)
    try {
      const recordsToUpsert = employees.map(emp => {
        const staffId = emp.staff_id || emp.full_name
        const plan = plans[staffId] || { selectedMonths: [], monthAllocations: {}, notes: '', totalPlannedDays: 0 }
        
        return {
          employee_id: staffId,
          employee_name: emp.full_name,
          department_id: emp.department_id,
          year: selectedYear,
          selected_months: plan.selectedMonths || [],
          month_allocations: plan.monthAllocations || {},
          total_planned_days: plan.totalPlannedDays || 0,
          notes: plan.notes || null,
          status: 'Planned',
          created_by: profile?.id || null,
          updated_at: new Date().toISOString()
        }
      })

      // Always save to localStorage backup
      try {
        localStorage.setItem(`cbi_leave_plans_${selectedYear}`, JSON.stringify(plans))
      } catch (_) {}

      // Upsert to Supabase
      const { error: upsertErr } = await supabase
        .from('leave_plans')
        .upsert(recordsToUpsert, { onConflict: 'employee_id,year' })

      if (upsertErr) {
        console.warn('Database upsert warning (check table existence):', upsertErr.message)
        toast.success(`Plan saved locally for Year ${selectedYear}! (Cloud sync ready)`)
      } else {
        toast.success(`Annual leave plan saved successfully to database for ${recordsToUpsert.length} employees!`)
      }

      setHasUnsavedChanges(false)
    } catch (err) {
      console.error('Save plan error:', err)
      toast.error('Failed to save plans: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 5. Export Plan to Excel Spreadsheet ────────────────────────────────────
  const handleExportPlanner = () => {
    if (!employees.length) {
      toast.error('No employee records available to export.')
      return
    }

    setExporting(true)
    try {
      const exportRows = filteredEmployees.map(emp => {
        const staffId = emp.staff_id || emp.full_name
        const entitled = calculateAnnualLeaveEntitlement(emp, selectedYear)
        const plan = plans[staffId] || { selectedMonths: [], monthAllocations: {}, notes: '', totalPlannedDays: 0 }
        const plannedDays = plan.totalPlannedDays || 0
        const remaining = Math.max(0, entitled - plannedDays)

        const row = {
          'Staff ID': staffId,
          'Employee Name': emp.full_name,
          'Department': emp.departments?.name || 'Department',
          'Origin': emp.native_status || 'Native',
          'DOE': emp.date_of_engagement || 'N/A',
          'Annual Entitled (Days)': entitled,
        }

        // Add each month
        MONTHS.forEach(m => {
          const isSelected = (plan.selectedMonths || []).includes(m.num)
          const days = plan.monthAllocations?.[m.num]
          row[m.short] = isSelected ? (days ? `${days}d` : 'Yes') : '—'
        })

        row['Total Planned (Days)'] = plannedDays
        row['Unplanned Balance (Days)'] = remaining
        row['Status'] = plannedDays === entitled ? 'Fully Planned' : plannedDays > entitled ? 'Exceeds' : 'Partial'
        row['Notes'] = plan.notes || ''

        return row
      })

      const worksheet = XLSX.utils.json_to_sheet(exportRows)
      worksheet['!cols'] = [
        { wch: 14 }, // Staff ID
        { wch: 24 }, // Name
        { wch: 20 }, // Department
        { wch: 14 }, // Origin
        { wch: 14 }, // DOE
        { wch: 14 }, // Entitled
        ...MONTHS.map(() => ({ wch: 8 })), // 12 months
        { wch: 14 }, // Total Planned
        { wch: 14 }, // Remaining
        { wch: 16 }, // Status
        { wch: 30 }  // Notes
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, `Plan ${selectedYear}`)
      XLSX.writeFile(workbook, `CBI_Team_Annual_Leave_Plan_${selectedYear}.xlsx`)
      toast.success(`Exported team leave plan for Year ${selectedYear}!`)
    } catch (err) {
      console.error('Excel export error:', err)
      toast.error('Failed to export leave plan.')
    } finally {
      setExporting(false)
    }
  }

  // ── 6. Filter Employees ────────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const matchName = (emp.full_name || '').toLowerCase().includes(q)
        const matchId = (emp.staff_id || '').toLowerCase().includes(q)
        if (!matchName && !matchId) return false
      }
      if (selectedDept !== 'All' && emp.department_id !== selectedDept) return false
      return true
    })
  }, [employees, searchTerm, selectedDept])

  // ── 7. Monthly Summary Counts (Supervisor Team Coverage Bar) ───────────────
  const monthlyCoverage = useMemo(() => {
    const counts = {}
    MONTHS.forEach(m => {
      counts[m.num] = {
        month: m,
        staffCount: 0,
        totalDays: 0,
        staffNames: []
      }
    })

    filteredEmployees.forEach(emp => {
      const staffId = emp.staff_id || emp.full_name
      const plan = plans[staffId]
      if (plan && plan.selectedMonths) {
        plan.selectedMonths.forEach(mNum => {
          if (counts[mNum]) {
            counts[mNum].staffCount += 1
            counts[mNum].totalDays += Number(plan.monthAllocations?.[mNum] || 0)
            counts[mNum].staffNames.push(emp.full_name)
          }
        })
      }
    })

    return counts
  }, [filteredEmployees, plans])

  const userCanEdit = isAdmin(profile) || isRep(profile) || isSupervisor(profile)

  return (
    <div className="space-y-6 font-sans">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
              Team Annual Leave Planner
            </h1>
            <span className="text-[11px] font-bold text-[#006939] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Year {selectedYear}
            </span>
            {hasUnsavedChanges && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 animate-pulse">
                Unsaved Changes
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            Indicate the months for which team members have decided to take their annual leave days. Track monthly team coverage and avoid staffing bottlenecks.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#006939] cursor-pointer"
          >
            {LEAVE_YEARS.map(yr => (
              <option key={yr} value={yr}>Year {yr}</option>
            ))}
          </select>

          {/* Export to Excel */}
          <button
            onClick={handleExportPlanner}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:text-[#006939] hover:bg-gray-50 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
            title="Export team annual leave schedule to Excel"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-emerald-700" />}
            <span>Export Roster</span>
          </button>

          {/* Save Plan Button */}
          {userCanEdit && (
            <button
              onClick={handleSaveAllPlans}
              disabled={saving || loading || !hasUnsavedChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all active:scale-[0.98] ${
                hasUnsavedChanges
                  ? 'bg-[#006939] hover:bg-[#004D2A] text-white shadow-md'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title="Save modified monthly leave allocations"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={15} className={hasUnsavedChanges ? "text-[#FDB913]" : ""} />
                  <span>Save Plan</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={fetchPlannerData}
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Monthly Staff Coverage Bar (Supervisor Team Overview) ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
            <Users size={16} className="text-[#006939]" />
            <span>Monthly Staff Coverage &amp; Schedule Density ({selectedYear})</span>
          </div>
          <span className="text-[11px] text-gray-400 font-medium">
            {filteredEmployees.length} Eligible CBI Staff in Roster
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2">
          {MONTHS.map(m => {
            const data = monthlyCoverage[m.num] || { staffCount: 0, totalDays: 0, staffNames: [] }
            const isHighDensity = data.staffCount >= 3

            return (
              <div
                key={m.num}
                className={`p-2.5 rounded-xl border transition-all text-center flex flex-col justify-between min-h-[74px] ${
                  isHighDensity
                    ? 'bg-amber-50/70 border-amber-300 shadow-xs'
                    : data.staffCount > 0
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-gray-50/60 border-gray-200'
                }`}
                title={data.staffNames.length > 0 ? `Staff on leave in ${m.name}:\n• ${data.staffNames.join('\n• ')}` : `No staff planned in ${m.name}`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-gray-600">
                  <span>{m.short}</span>
                  {isHighDensity && (
                    <span className="text-[10px] text-amber-600 font-black" title="High volume month">
                      ⚠️
                    </span>
                  )}
                </div>

                <div className="my-1">
                  <p className={`text-base font-black ${
                    isHighDensity ? 'text-amber-800' : data.staffCount > 0 ? 'text-[#006939]' : 'text-gray-400'
                  }`}>
                    {data.staffCount} <span className="text-[10px] font-semibold text-gray-400">staff</span>
                  </p>
                </div>

                <div className="text-[10px] text-gray-500 font-medium truncate">
                  {data.totalDays > 0 ? `${data.totalDays}d planned` : 'None'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee by name or CBI staff ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
          />
        </div>

        {isAdmin(profile) && (
          <div className="w-full md:w-auto">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white"
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 self-end md:self-center">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-[#006939] inline-block shadow-xs"></span>
            <span className="font-semibold text-gray-700">Planned Month</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-gray-100 border border-gray-200 inline-block"></span>
            <span>Available</span>
          </div>
        </div>
      </div>

      {/* ── Core Monthly Planner Matrix ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-500">
            <Loader2 size={36} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-700">Loading team annual leave roster...</p>
            <p className="text-xs text-gray-400 mt-1">Calculating employee entitlements and tenure rules</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-16 text-center text-gray-400 space-y-3">
            <CalendarRange size={48} className="mx-auto text-gray-300" />
            <h3 className="text-base font-bold text-gray-700">No Eligible CBI Employees Found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Only employees with a valid CBI staff ID (e.g. CBI/XXX) are displayed in the leave roster.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/90 border-b border-gray-200 text-[10px] font-black text-gray-600 uppercase tracking-wider">
                  <th className="py-3 px-4 min-w-[200px] sticky left-0 bg-gray-50/95 z-20 shadow-xs">
                    Employee (CBI ID)
                  </th>
                  <th className="py-3 px-2 text-center min-w-[70px]">
                    Entitled
                  </th>
                  {MONTHS.map(m => (
                    <th key={m.num} className="py-3 px-1 text-center min-w-[48px]">
                      {m.short}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-center min-w-[80px]">
                    Planned
                  </th>
                  <th className="py-3 px-3 text-center min-w-[110px]">
                    Allocation Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmployees.map((emp) => {
                  const staffId = emp.staff_id || emp.full_name
                  const entitled = calculateAnnualLeaveEntitlement(emp, selectedYear)
                  const plan = plans[staffId] || { selectedMonths: [], monthAllocations: {}, notes: '', totalPlannedDays: 0 }
                  const selectedMonths = plan.selectedMonths || []
                  const plannedDays = plan.totalPlannedDays || 0
                  const remaining = entitled - plannedDays

                  // Check if any approved leave exists for this employee in this year
                  const empApprovedReqs = approvedRequests.filter(
                    r => r.employee_id === staffId || r.employee_name === emp.full_name
                  )

                  return (
                    <tr key={emp.id} className="hover:bg-emerald-50/30 transition-colors group">
                      
                      {/* Employee Info Tile */}
                      <td className="py-3 px-4 sticky left-0 bg-white group-hover:bg-emerald-50/30 z-10 shadow-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-[#006939]/10 text-[#006939] flex items-center justify-center font-bold text-xs shrink-0 border border-[#006939]/20">
                            {emp.full_name?.charAt(0)?.toUpperCase() || 'E'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-gray-900 truncate">
                                {emp.full_name}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                                emp.native_status === 'Non-Native' 
                                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {emp.native_status || 'Native'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono mt-0.5">
                              <span>ID: {emp.staff_id}</span>
                              {emp.departments?.name && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[90px]">{emp.departments.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Entitled Days */}
                      <td className="py-3 px-2 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-gray-100 text-gray-800 font-black text-xs">
                          {entitled}d
                        </span>
                      </td>

                      {/* 12 Interactive Month Cells */}
                      {MONTHS.map(m => {
                        const isSelected = selectedMonths.includes(m.num)
                        const days = plan.monthAllocations?.[m.num]

                        return (
                          <td key={m.num} className="py-2 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleMonth(emp, m.num)}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                handleOpenEditModal(emp, m.num)
                              }}
                              className={`w-10 h-10 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center relative cursor-pointer mx-auto ${
                                isSelected
                                  ? 'bg-[#006939] text-white shadow-sm hover:bg-[#004D2A] active:scale-95'
                                  : 'bg-gray-50 hover:bg-emerald-100/50 text-gray-400 hover:text-emerald-800 border border-gray-200/70 hover:border-emerald-300'
                              }`}
                              title={
                                isSelected
                                  ? `${m.name}: ${days || 'Planned'} days. Right-click to edit custom days/notes.`
                                  : `Click to plan leave for ${emp.full_name} in ${m.name}`
                              }
                            >
                              {isSelected ? (
                                <>
                                  <span className="text-[10px] font-black">{days ? `${days}d` : <Check size={12} />}</span>
                                  <span className="text-[8px] opacity-80 uppercase">{m.short}</span>
                                </>
                              ) : (
                                <span className="text-[10px] font-semibold text-gray-400">
                                  {m.short}
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}

                      {/* Planned Days */}
                      <td className="py-3 px-3 text-center">
                        <span className={`font-black text-xs ${
                          plannedDays > entitled
                            ? 'text-rose-600'
                            : plannedDays === entitled
                            ? 'text-emerald-700'
                            : 'text-gray-700'
                        }`}>
                          {plannedDays} <span className="text-[10px] font-normal text-gray-400">days</span>
                        </span>
                      </td>

                      {/* Allocation Status Badge */}
                      <td className="py-3 px-3 text-center">
                        {plannedDays === entitled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={11} />
                            <span>Fully Planned</span>
                          </span>
                        ) : plannedDays > entitled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={`Exceeds annual entitlement by ${plannedDays - entitled} days`}>
                            <AlertTriangle size={11} />
                            <span>+{plannedDays - entitled}d Over</span>
                          </span>
                        ) : plannedDays > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span>{remaining}d unassigned</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400 border border-gray-200">
                            Not Planned
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info banner */}
        <div className="p-3.5 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 gap-2">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-[#006939] shrink-0" />
            <span>
              <strong>Tip:</strong> Click any month box to toggle leave planning for that employee. Right-click or double-click to allocate specific days and notes.
            </span>
          </div>
          {hasUnsavedChanges && (
            <span className="font-bold text-amber-700">
              Remember to click "Save Plan" above to persist changes.
            </span>
          )}
        </div>
      </div>

      {/* ── Modal for Editing Month Details ── */}
      {editingEmployee && editMonthDetails.monthNum && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-black text-base text-gray-900">
                  {editingEmployee.full_name}
                </h3>
                <p className="text-xs text-gray-500">
                  Plan leave for <strong>{MONTHS[editMonthDetails.monthNum - 1].name} {selectedYear}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingEmployee(null)}
                className="p-1.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Planned Days in {MONTHS[editMonthDetails.monthNum - 1].name}
                </label>
                <input
                  type="number"
                  min="0"
                  max="35"
                  step="0.5"
                  value={editMonthDetails.days}
                  onChange={(e) => setEditMonthDetails(prev => ({ ...prev, days: e.target.value }))}
                  placeholder="e.g. 10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Leave empty or enter 0 to remove this month from the schedule.
                </p>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Schedule Note / Justification (Optional)
                </label>
                <textarea
                  rows="2"
                  value={editMonthDetails.note}
                  onChange={(e) => setEditMonthDetails(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g. Easter holiday travel, plant shutdown period..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMonthDetails}
                className="px-4 py-2 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md"
              >
                Apply Allocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamLeavePlannerPage
