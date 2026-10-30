import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { 
  isEligibleForLeave, 
  getEntitlementBreakdown,
  calculateAnnualLeaveEntitlement,
  LEAVE_YEARS
} from '../../utils/leaveHelpers'
import * as XLSX from 'xlsx'
import { 
  Layers, 
  Search, 
  Filter, 
  User, 
  Building2, 
  CalendarDays, 
  Loader2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  TrendingDown,
  Download,
  FileSpreadsheet,
  ArrowUpRight,
  ChevronRight,
  LayoutGrid,
  List,
  BadgeCheck,
  Calendar,
  Sparkles,
  UploadCloud,
  Banknote,
  Coins
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import BatchLeaveUploadModal from '../../components/leave/BatchLeaveUploadModal'

export const LeaveBalancesPage = () => {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [balances, setBalances] = useState([])

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedDept, setSelectedDept] = useState('All')
  const [departments, setDepartments] = useState([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [showBatchModal, setShowBatchModal] = useState(false)

  const fetchBalancesData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      // 1. Fetch leave types
      const { data: ltData } = await supabase
        .from('leave_types')
        .select('*')
        .order('name')
      const types = ltData || []
      setLeaveTypes(types)

      // 2. Fetch departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .order('name')
      setDepartments(deptData || [])

      // 3. Fetch active employees - EXCLUDING Abanach
      let empQuery = supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          staff_id,
          department_id,
          company,
          hourly_rate,
          date_of_engagement,
          native_status,
          departments (name)
        `)
        .eq('is_active', true)
        .neq('company', 'Abanach') // Exclude Abanach company staff
        .order('full_name')

      if (!isAdmin(profile) && profile.department_id) {
        empQuery = empQuery.eq('department_id', profile.department_id)
      }

      const { data: empData, error: empError } = await empQuery
      if (empError) throw empError
      
      // Filter out Abanach
      const emps = (empData || []).filter(isEligibleForLeave)

      // Query latest positive hourly rates from Overtime App (overtime_records) for fallback
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

      emps.forEach(emp => {
        let rate = Number(emp.hourly_rate || 0)
        if (rate === 0) {
          const fallback = otRateById.get(emp.staff_id) || 
                           otRateById.get(emp.id) || 
                           otRateByName.get((emp.full_name || '').toLowerCase().trim())
          if (fallback) {
            emp.hourly_rate = fallback
          }
        }
      })

      setEmployees(emps)

      // 4. Fetch all approved leave requests for the selected year
      const yearStart = `${selectedYear}-01-01`
      const yearEnd = `${selectedYear}-12-31`

      let reqQuery = supabase
        .from('leave_requests')
        .select('employee_id, employee_name, department_id, leave_type_id, total_days, status')
        .eq('status', 'Approved')
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd)

      if (!isAdmin(profile) && profile.department_id) {
        reqQuery = reqQuery.eq('department_id', profile.department_id)
      }

      const { data: reqData } = await reqQuery
      const approvedRequests = reqData || []

      // 5. Fetch custom balances if any in leave_balances table
      const { data: customBals } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('year', selectedYear)

      // Map combined balance per employee and leave type
      const balanceRows = []

      emps.forEach(emp => {
        const staffId = emp.staff_id || emp.full_name

        types.forEach(lt => {
          const isAnnual = (lt.name || '').trim().toLowerCase() === 'annual leave'

          // Check custom entitled days or dynamically calculate from DOE and Native Status
          const customEntry = (customBals || []).find(
            b => b.employee_id === staffId && b.leave_type_id === lt.id
          )
          
          const breakdown = getEntitlementBreakdown(emp, lt, selectedYear)
          const entitled = customEntry && customEntry.entitled_days !== null && customEntry.entitled_days !== undefined
            ? Number(customEntry.entitled_days)
            : breakdown.entitled

          // Calculate used days from approved requests
          const used = approvedRequests
            .filter(r => r.employee_id === staffId && r.leave_type_id === lt.id)
            .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

          // RULE: Only Annual Leave is displayed by default.
          // Other categories are only displayed when utilized (used > 0)
          if (!isAnnual && used <= 0) {
            return
          }

          const remaining = Math.max(0, entitled - used)

          // Financial Valuation from Overtime App: hourly_rate * 8 = 1 day's value
          const hourlyRate = Number(emp.hourly_rate || 0)
          const dayValue = hourlyRate * 8
          const entitledCost = entitled * dayValue
          const usedCost = used * dayValue
          const remainingCost = remaining * dayValue

          balanceRows.push({
            employeeId: staffId,
            employeeName: emp.full_name,
            departmentName: emp.departments?.name || 'Department',
            departmentId: emp.department_id,
            company: emp.company || 'CBI',
            hourlyRate,
            dayValue,
            entitledCost,
            usedCost,
            remainingCost,
            dateOfEngagement: emp.date_of_engagement || null,
            nativeStatus: emp.native_status || 'Native',
            tenureYears: breakdown.tenureYears ?? null,
            bonusDays: breakdown.bonusDays ?? 0,
            baseDays: breakdown.baseDays ?? entitled,
            accumulatedDays: isAnnual ? (breakdown.accumulatedDays ?? 0) : used,
            monthsSpent: breakdown.monthsSpent ?? 0,
            isProrated: isAnnual && (breakdown.isProrated ?? false),
            monthsFromDoeToEndOfYear: breakdown.monthsFromDoeToEndOfYear ?? 12,
            breakdownText: breakdown.text ?? '',
            leaveTypeId: lt.id,
            leaveTypeName: lt.name,
            isAnnual,
            entitledDays: entitled,
            usedDays: used,
            remainingDays: remaining
          })
        })
      })

      setBalances(balanceRows)

    } catch (err) {
      console.error('Fetch balances error:', err.message)
      toast.error('Could not load leave balances.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBalancesData()
  }, [profile, selectedYear])

  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState('tiles') // 'tiles' | 'table'

  // Filter unique employees for the tile view
  const filteredEmployees = employees.filter(emp => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchName = (emp.full_name || '').toLowerCase().includes(search)
      const matchId = (emp.staff_id || '').toLowerCase().includes(search)
      if (!matchName && !matchId) return false
    }
    if (selectedDept !== 'All' && emp.department_id !== selectedDept) return false
    return true
  })

  // Helper to extract employee balance summary
  const getEmployeeSummary = (staffId) => {
    const empBals = balances.filter(b => b.employeeId === staffId)
    const annualBal = empBals.find(b => b.isAnnual || (b.leaveTypeName || '').toLowerCase() === 'annual leave')
    const otherUtilized = empBals.filter(b => !b.isAnnual && (b.leaveTypeName || '').toLowerCase() !== 'annual leave')
    const totalRemaining = annualBal ? annualBal.remainingDays : 0
    const totalEntitled = annualBal ? annualBal.entitledDays : 0
    const totalUsed = annualBal ? annualBal.usedDays : 0
    const hourlyRate = annualBal ? annualBal.hourlyRate : 0
    const dayValue = annualBal ? annualBal.dayValue : 0
    const entitledCost = annualBal ? annualBal.entitledCost : 0
    const usedCost = annualBal ? annualBal.usedCost : 0
    const remainingCost = annualBal ? annualBal.remainingCost : 0
    return {
      annualBal,
      otherUtilized,
      totalRemaining,
      totalEntitled,
      totalUsed,
      hourlyRate,
      dayValue,
      entitledCost,
      usedCost,
      remainingCost,
      empBals
    }
  }

  // Summary aggregates across filtered employees
  const summaryAggregates = filteredEmployees.reduce((acc, emp) => {
    const staffId = emp.staff_id || emp.full_name
    const sum = getEmployeeSummary(staffId)
    acc.totalEntitledDays += sum.totalEntitled
    acc.totalUsedDays += sum.totalUsed
    acc.totalRemainingDays += sum.totalRemaining
    acc.totalEntitledCost += sum.entitledCost
    acc.totalUsedCost += sum.usedCost
    acc.totalRemainingCost += sum.remainingCost
    return acc
  }, {
    totalEntitledDays: 0,
    totalUsedDays: 0,
    totalRemainingDays: 0,
    totalEntitledCost: 0,
    totalUsedCost: 0,
    totalRemainingCost: 0
  })

  // Filter rows
  const filteredBalances = balances.filter(b => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchName = b.employeeName.toLowerCase().includes(search)
      const matchId = b.employeeId.toLowerCase().includes(search)
      if (!matchName && !matchId) return false
    }

    if (selectedType !== 'All' && b.leaveTypeId !== selectedType) return false
    if (selectedDept !== 'All' && b.departmentId !== selectedDept) return false

    return true
  })

  // Admin Export Balances to Excel
  const handleExportBalances = () => {
    if (!isAdmin(profile)) {
      toast.error('Only Administrators are authorized to export balance reports.')
      return
    }

    if (!filteredBalances.length) {
      toast.error('No balance records found to export.')
      return
    }

    setExporting(true)
    try {
      const exportRows = filteredBalances.map(row => {
        const pct = row.entitledDays > 0 ? Math.round((row.usedDays / row.entitledDays) * 100) : 0
        return {
          'Year': selectedYear,
          'Staff ID': row.employeeId,
          'Employee Name': row.employeeName,
          'Department': row.departmentName,
          'Company': row.company,
          'DOE': row.dateOfEngagement || 'N/A',
          'Origin': row.nativeStatus,
          'Tenure (Yrs)': row.tenureYears !== null && row.tenureYears !== undefined ? row.tenureYears : 'N/A',
          'Leave Category': row.leaveTypeName,
          'Entitled Days': row.entitledDays,
          'Prorated': row.isProrated ? `Yes (${row.monthsFromDoeToEndOfYear} mos to year-end)` : 'No',
          'Accumulated to Date': row.accumulatedDays,
          'Months Spent': row.monthsSpent,
          'Bonus Days': row.bonusDays || 0,
          'Used Days': row.usedDays,
          'Remaining Days': row.remainingDays,
          'Hourly Rate (GHS)': row.hourlyRate || 0,
          'Day Value (GHS)': row.dayValue || 0,
          'Annual Cost (GHS)': row.isAnnual ? row.entitledCost : 0,
          'Used Cost (GHS)': row.isAnnual ? row.usedCost : 0,
          'Remaining Cost (GHS)': row.isAnnual ? row.remainingCost : 0,
          'Utilization (%)': `${pct}%`,
          'Breakdown Note': row.breakdownText || ''
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(exportRows)
      worksheet['!cols'] = [
        { wch: 10 }, // Year
        { wch: 14 }, // Staff ID
        { wch: 24 }, // Employee Name
        { wch: 20 }, // Department
        { wch: 12 }, // Company
        { wch: 14 }, // DOE
        { wch: 14 }, // Origin
        { wch: 14 }, // Tenure
        { wch: 20 }, // Leave Category
        { wch: 14 }, // Entitled Days
        { wch: 20 }, // Prorated
        { wch: 18 }, // Accumulated to Date
        { wch: 14 }, // Months Spent
        { wch: 12 }, // Bonus Days
        { wch: 12 }, // Used Days
        { wch: 16 }, // Remaining Days
        { wch: 16 }, // Utilization
        { wch: 36 }  // Breakdown Note
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, `Balances ${selectedYear}`)
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CBI_Leave_Balances_${selectedYear}_${format(new Date(), 'yyyyMMdd')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`Exported ${exportRows.length} balance record(s) to Excel!`)
    } catch (err) {
      console.error('Balance export error:', err)
      toast.error('Failed to export leave balances to Excel.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
              Leave Balances & Entitlements
            </h1>
            <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200 hidden sm:inline-block">
              Excludes Abanach
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Track annual statutory days, taken time off, and remaining balances per CBI team member.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Admin Batch Upload Button */}
          {isAdmin(profile) && (
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-sm transition-all active:scale-[0.98]"
              title="Batch upload employee current leave days, DOE, and native status"
            >
              <UploadCloud size={16} className="text-[#FDB913]" />
              <span>Batch Upload</span>
            </button>
          )}

          {/* Admin Excel Export Button */}
          {isAdmin(profile) && (
            <button
              onClick={handleExportBalances}
              disabled={exporting || loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              title="Export employee balances to Excel (.xlsx)"
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={16} className="text-[#FDB913]" />
              )}
              <span>Export Balances</span>
            </button>
          )}

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            {LEAVE_YEARS.map(yr => (
              <option key={yr} value={yr}>Year {yr}</option>
            ))}
          </select>

          <button
            onClick={fetchBalancesData}
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Financial & Days Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
            CBI Employees ({selectedYear})
          </span>
          <p className="text-2xl font-black text-gray-900 mt-0.5">
            {filteredEmployees.length}
          </p>
          <span className="text-[11px] text-gray-500 font-medium">
            Eligible CBI personnel
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
            Annual Leave Days
          </span>
          <p className="text-2xl font-black text-gray-900 mt-0.5">
            {summaryAggregates.totalUsedDays} <span className="text-xs text-gray-400 font-normal">/ {summaryAggregates.totalEntitledDays}d</span>
          </p>
          <span className="text-[11px] text-[#006939] font-bold">
            {summaryAggregates.totalRemainingDays} days available
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
          <span className="text-[11px] font-bold text-[#006939] uppercase tracking-wider block">
            Annual Leave Cost Liability
          </span>
          <p className="text-xl sm:text-2xl font-black text-[#006939] mt-0.5">
            GHS {summaryAggregates.totalEntitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-gray-500 font-medium">
            Overtime rate × 8 hrs/day
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
            Incurred Cost of Days Taken
          </span>
          <p className="text-xl sm:text-2xl font-black text-amber-800 mt-0.5">
            GHS {summaryAggregates.totalUsedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-amber-700 font-medium">
            Remaining: GHS {summaryAggregates.totalRemainingCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee by name or staff ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
          />
        </div>

        <div className="w-full md:w-auto">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white"
          >
            <option value="All">All Leave Types</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
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

        {/* View Switcher: Tiles vs Table */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-100 p-1 gap-1 shrink-0 w-full md:w-auto">
          <button
            onClick={() => setViewMode('tiles')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'tiles'
                ? 'bg-white text-[#006939] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            title="View as Employee Tiles"
          >
            <LayoutGrid size={14} />
            <span>Tiles</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'table'
                ? 'bg-white text-[#006939] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            title="View as Category Table"
          >
            <List size={14} />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* Content Area: Loading vs Tiles vs Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center text-gray-500">
          <Loader2 size={36} className="animate-spin text-[#006939] mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-700">Calculating leave balances & entitlements...</p>
          <p className="text-xs text-gray-400 mt-1">Applying statutory DOE and origin formulas</p>
        </div>
      ) : viewMode === 'tiles' ? (
        /* ══════════════════════════════════════════════════════════════════
             VIEW MODE 1: EMPLOYEE TILES GRID
        ══════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {filteredEmployees.length} Eligible CBI Employee{filteredEmployees.length !== 1 ? 's' : ''} • Click any employee tile to view full dossier & balances
            </p>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
              <Layers size={48} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-600">No Employees Found</p>
              <p className="text-xs text-gray-400 mt-0.5">Try adjusting your search criteria or department filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmployees.map((emp) => {
                const staffId = emp.staff_id || emp.full_name
                const summary = getEmployeeSummary(staffId)
                const annual = summary.annualBal
                const pct = annual && annual.entitledDays > 0 ? Math.round((annual.usedDays / annual.entitledDays) * 100) : 0

                return (
                  <div
                    key={emp.id}
                    onClick={() => navigate(`/leave/balances/${encodeURIComponent(staffId)}?year=${selectedYear}`)}
                    className="bg-white rounded-2xl border border-gray-200 hover:border-[#006939] hover:shadow-lg p-5 transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939] opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="space-y-4">
                      {/* Top Row: Avatar & Identity */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-[#006939]/10 text-[#006939] flex items-center justify-center font-black text-lg shrink-0 border border-[#006939]/20 group-hover:bg-[#006939] group-hover:text-white transition-all shadow-inner">
                            {emp.full_name?.charAt(0)?.toUpperCase() || 'E'}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-base text-gray-900 group-hover:text-[#006939] transition-colors truncate">
                              {emp.full_name}
                            </h3>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                              <span className="font-mono font-bold text-gray-700">ID: {emp.staff_id || 'N/A'}</span>
                              <span>•</span>
                              <span className="truncate">{emp.departments?.name || 'CBI'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-1.5 rounded-xl bg-gray-50 group-hover:bg-emerald-100 text-gray-400 group-hover:text-[#006939] shrink-0 transition-colors">
                          <ArrowUpRight size={16} />
                        </div>
                      </div>

                      {/* Origin & DOE Badges */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full font-bold border ${
                          emp.native_status === 'Non-Native' 
                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {emp.native_status || 'Native'}
                        </span>
                        {emp.date_of_engagement && (
                          <span className="px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            DOE: {emp.date_of_engagement}
                          </span>
                        )}
                      </div>

                      {/* Annual Leave Highlight */}
                      {annual ? (
                        <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-gray-600">Annual Leave ({selectedYear})</span>
                            <span className="font-black text-[#006939]">
                              {annual.remainingDays} d left
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct > 80 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-[#006939]'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                            <span>{annual.usedDays} used of {annual.entitledDays} days</span>
                            <span 
                              className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200" 
                              title={`Accumulated to date: ${annual.accumulatedDays} days (${annual.monthsSpent} months spent in company)`}
                            >
                              {annual.accumulatedDays}d accumulated
                            </span>
                          </div>
                          {annual.bonusDays > 0 && (
                            <p className="text-[10px] text-emerald-700 font-bold">
                              +{annual.bonusDays} tenure anniversary bonus
                            </p>
                          )}
                          {annual.isProrated && (
                            <p className="text-[10px] text-blue-700 font-semibold bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100">
                              ℹ️ Prorated: {annual.entitledDays}d ({annual.monthsFromDoeToEndOfYear} mos from DOE to year-end)
                            </p>
                          )}

                          {/* Financial Cost of Annual Leave Days (from Overtime rate) */}
                          <div className="pt-2 border-t border-gray-200/70 flex items-center justify-between text-[11px]">
                            <span className="text-gray-500 font-medium" title={`Overtime rate: GHS ${summary.hourlyRate.toFixed(2)}/hr`}>
                              Day Value: <strong className="text-gray-800">GHS {summary.dayValue.toFixed(2)}</strong>
                            </span>
                            <span className="font-extrabold text-[#006939] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Cost: GHS {summary.entitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-xl text-center text-xs text-gray-400">
                          Balance calculating...
                        </div>
                      )}

                      {/* Other Categories Utilized (if any) */}
                      {summary.otherUtilized?.length > 0 && (
                        <div className="pt-2 border-t border-gray-100 space-y-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Other Categories Utilized:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {summary.otherUtilized.map((o) => (
                              <span
                                key={o.leaveTypeId}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-lg"
                              >
                                <span>{o.leaveTypeName}:</span>
                                <strong>{o.usedDays} used</strong>
                                <span className="text-amber-600">({o.remainingDays} left)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tile Footer */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-[#006939] group-hover:translate-x-0.5 transition-transform">
                      <span>View All Balances &amp; Dossier</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════
             VIEW MODE 2: DETAILED CATEGORY TABLE WITH CLICKABLE TILES
        ══════════════════════════════════════════════════════════════════ */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {filteredBalances.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Layers size={48} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-600">No Balances Available</p>
              <p className="text-xs text-gray-400 mt-0.5">Try adjusting filters or onboarding CBI department staff (Abanach staff excluded).</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Employee (Click tile for dossier)</th>
                    <th className="py-3.5 px-6">Department</th>
                    <th className="py-3.5 px-6">Leave Category</th>
                    <th className="py-3.5 px-6">Entitled</th>
                    <th className="py-3.5 px-6">Accumulated</th>
                    <th className="py-3.5 px-6">Used (Days)</th>
                    <th className="py-3.5 px-6">Available</th>
                    <th className="py-3.5 px-6">Day Value (8h)</th>
                    <th className="py-3.5 px-6">Leave Cost (GHS)</th>
                    <th className="py-3.5 px-6 text-right">Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                  {filteredBalances.map((row, idx) => {
                    const percentUsed = row.entitledDays > 0 
                      ? Math.min(100, Math.round((row.usedDays / row.entitledDays) * 100))
                      : 0

                    return (
                      <tr key={`${row.employeeId}-${row.leaveTypeId}-${idx}`} className="hover:bg-gray-50/60 transition-colors">
                        {/* Interactive Clickable Employee Tile */}
                        <td className="py-3.5 px-6">
                          <button
                            type="button"
                            onClick={() => navigate(`/leave/balances/${encodeURIComponent(row.employeeId)}?year=${selectedYear}`)}
                            className="group flex items-center justify-between gap-3 p-2 rounded-xl border border-gray-200 bg-white hover:border-[#006939] hover:bg-emerald-50/50 hover:shadow-sm transition-all text-left w-full cursor-pointer max-w-xs"
                            title="Click to view employee dossier & all leave balances for the year"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-[#006939]/10 text-[#006939] flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#006939] group-hover:text-white transition-colors">
                                {row.employeeName?.charAt(0)?.toUpperCase() || 'E'}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-gray-900 group-hover:text-[#006939] transition-colors truncate">
                                    {row.employeeName}
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                                    row.nativeStatus === 'Non-Native' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}>
                                    {row.nativeStatus}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5">
                                  <span className="font-mono">ID: {row.employeeId}</span>
                                  {row.dateOfEngagement && (
                                    <>
                                      <span>•</span>
                                      <span>DOE: {row.dateOfEngagement}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="p-1 rounded-md bg-gray-50 group-hover:bg-emerald-100/60 text-gray-400 group-hover:text-[#006939] shrink-0 transition-colors">
                              <ArrowUpRight size={13} />
                            </div>
                          </button>
                        </td>
                        <td className="py-3.5 px-6 text-gray-600">
                          {row.departmentName}
                        </td>
                        <td className="py-3.5 px-6 font-semibold text-gray-800">
                          {row.leaveTypeName}
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-gray-700">{row.entitledDays} days</span>
                            {row.isProrated && (
                              <span 
                                className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200"
                                title={`Prorated from DOE: ${row.monthsFromDoeToEndOfYear} months to year-end`}
                              >
                                Prorated
                              </span>
                            )}
                          </div>
                          {row.bonusDays > 0 && (
                            <p className="text-[10px] text-emerald-600 font-semibold">
                              +{row.bonusDays} tenure bonus
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="font-extrabold text-blue-800">{row.accumulatedDays} days</span>
                          {row.monthsSpent > 0 && (
                            <p className="text-[10px] text-gray-400 font-medium">
                              {row.monthsSpent} mos spent
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="font-bold text-amber-700">{row.usedDays}</span>
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-emerald-50 text-[#006939] font-black text-xs border border-emerald-100">
                            {row.remainingDays} days
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="font-extrabold text-gray-800 text-xs block">
                            GHS {row.dayValue ? row.dayValue.toFixed(2) : '0.00'}
                          </span>
                          <span className="text-[10px] text-gray-400 block truncate" title={`Hourly rate from Overtime app: GHS ${row.hourlyRate ? row.hourlyRate.toFixed(2) : '0.00'}/hr`}>
                            @ GHS {row.hourlyRate ? row.hourlyRate.toFixed(2) : '0.00'}/h
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          {row.isAnnual ? (
                            <div>
                              <span className="font-black text-[#006939] text-xs block">
                                GHS {row.entitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-amber-700 font-semibold block">
                                Used: GHS {row.usedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  percentUsed > 80 ? 'bg-rose-500' : percentUsed > 50 ? 'bg-amber-500' : 'bg-[#006939]'
                                }`}
                                style={{ width: `${percentUsed}%` }}
                              ></div>
                            </div>
                            <span className="text-[11px] font-bold text-gray-500 w-8 text-right">
                              {percentUsed}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Admin Batch Leave Upload Modal */}
      {isAdmin(profile) && (
        <BatchLeaveUploadModal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          selectedYear={selectedYear}
          employees={employees}
          leaveTypes={leaveTypes}
          onSuccess={fetchBalancesData}
        />
      )}
    </div>
  )
}

export default LeaveBalancesPage
