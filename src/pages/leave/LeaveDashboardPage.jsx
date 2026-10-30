import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { 
  canApplyLeave, 
  LEAVE_STATUS_COLORS, 
  LEAVE_YEARS, 
  isEligibleForLeave,
  calculateAnnualLeaveEntitlement 
} from '../../utils/leaveHelpers'
import { 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  PlusCircle, 
  Users, 
  ArrowRight, 
  CalendarRange, 
  Layers, 
  TrendingUp, 
  Activity,
  Loader2, 
  RefreshCw, 
  UserCheck,
  Banknote,
  Building2,
  Filter,
  BarChart3,
  Calendar,
  Sparkles
} from 'lucide-react'
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  CartesianGrid, 
  Cell 
} from 'recharts'
import toast from 'react-hot-toast'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'

const LEAVE_COLORS = ['#006939', '#FDB913', '#34D399', '#60A5FA', '#A78BFA', '#F87171', '#FB923C']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const LeaveDashboardPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  // Filter States
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedDeptId, setSelectedDeptId] = useState('all')
  const [trendMetric, setTrendMetric] = useState('days') // 'days' | 'cost'

  // Loading & Data States
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState([])
  const [eligibleProfiles, setEligibleProfiles] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [requests, setRequests] = useState([])

  const fetchDashboardData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      // 1. Fetch leave types
      const { data: ltData } = await supabase
        .from('leave_types')
        .select('*')
        .order('name')
      setLeaveTypes(ltData || [])

      // 2. Fetch departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('id, name, code')
        .order('name')
      setDepartments(deptData || [])

      // 3. Fetch all profiles for leave calculations (eligible CBI employees)
      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .select(`
          id,
          staff_id,
          full_name,
          role,
          department_id,
          hourly_rate,
          date_of_engagement,
          native_status,
          company,
          departments (id, name)
        `)
      if (profError) throw profError

      const eligible = (profData || []).filter(p => isEligibleForLeave(p))
      setEligibleProfiles(eligible)

      // 4. Fetch leave requests
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          departments (id, name),
          leave_types (id, name, default_days),
          captured_by_profile:profiles!leave_requests_captured_by_fkey (full_name),
          reviewed_by_profile:profiles!leave_requests_reviewed_by_fkey (full_name)
        `)
        .order('captured_at', { ascending: false })

      // Department restriction for non-admins if they don't have global visibility
      if (!isAdmin(profile) && profile.department_id) {
        query = query.eq('department_id', profile.department_id)
      }

      const { data: reqData, error: reqError } = await query
      if (reqError) throw reqError

      setRequests(reqData || [])
    } catch (err) {
      console.error('Leave dashboard fetch error:', err)
      toast.error('Could not load leave dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()

    const channel = supabase
      .channel('realtime-leave-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  // Set default department filter based on profile
  useEffect(() => {
    if (profile && !isAdmin(profile) && profile.department_id) {
      setSelectedDeptId(profile.department_id)
    }
  }, [profile])

  // ════════════════════════════════════════════════════════════════════════════
  // COMPUTATIONS & ANALYTICS
  // ════════════════════════════════════════════════════════════════════════════

  // Helper: check working days for a request in a specific month
  const getWorkingDaysInMonth = (startDateStr, endDateStr, totalDays, year, monthIdx) => {
    if (!startDateStr || !endDateStr) return 0
    const reqStart = new Date(startDateStr + 'T00:00:00')
    const reqEnd = new Date(endDateStr + 'T00:00:00')
    const monthStart = new Date(year, monthIdx, 1)
    const monthEnd = new Date(year, monthIdx + 1, 0)

    if (reqEnd < monthStart || reqStart > monthEnd) return 0

    const winStart = reqStart > monthStart ? reqStart : monthStart
    const winEnd = reqEnd < monthEnd ? reqEnd : monthEnd

    let count = 0
    const cur = new Date(winStart)
    while (cur <= winEnd) {
      const d = cur.getDay()
      if (d !== 0 && d !== 6) {
        count++
      }
      cur.setDate(cur.getDate() + 1)
    }
    return Math.min(count, Number(totalDays) || 0)
  }

  // Helper: check if request belongs to selected year
  const isRequestInYear = (req, year) => {
    if (!req.start_date || !req.end_date) return false
    const startYr = new Date(req.start_date).getFullYear()
    const endYr = new Date(req.end_date).getFullYear()
    return startYr === year || endYr === year
  }

  // Profile Map for fast lookup
  const profileMap = useMemo(() => {
    const map = new Map()
    eligibleProfiles.forEach(p => map.set(p.id, p))
    return map
  }, [eligibleProfiles])

  // Filtered Profiles & Requests according to Department Filter
  const filteredProfiles = useMemo(() => {
    if (selectedDeptId === 'all') return eligibleProfiles
    return eligibleProfiles.filter(p => p.department_id === selectedDeptId)
  }, [eligibleProfiles, selectedDeptId])

  const filteredRequests = useMemo(() => {
    if (selectedDeptId === 'all') return requests
    return requests.filter(r => r.department_id === selectedDeptId)
  }, [requests, selectedDeptId])

  // Approved Annual Leave Requests for selected year
  const approvedAnnualRequestsInYear = useMemo(() => {
    return filteredRequests.filter(r => {
      const isAnnual = (r.leave_types?.name || '').trim().toLowerCase() === 'annual leave'
      return r.status === 'Approved' && isAnnual && isRequestInYear(r, selectedYear)
    })
  }, [filteredRequests, selectedYear])

  // 1. Departmental Breakdown (Days & Financial Costs)
  const departmentalStats = useMemo(() => {
    // Map of deptId -> stats
    const deptStatsMap = new Map()

    // Initialize with departments
    departments.forEach(dept => {
      deptStatsMap.set(dept.id, {
        deptId: dept.id,
        deptName: dept.name,
        deptCode: dept.code || dept.name.substring(0, 3).toUpperCase(),
        headcount: 0,
        entitledDays: 0,
        usedDays: 0,
        remainingDays: 0,
        entitledCost: 0,
        usedCost: 0,
        remainingCost: 0,
        utilizationDaysPct: 0,
        utilizationCostPct: 0
      })
    })

    // Also handle unassigned department if any
    deptStatsMap.set('unassigned', {
      deptId: 'unassigned',
      deptName: 'Unassigned',
      deptCode: 'N/A',
      headcount: 0,
      entitledDays: 0,
      usedDays: 0,
      remainingDays: 0,
      entitledCost: 0,
      usedCost: 0,
      remainingCost: 0,
      utilizationDaysPct: 0,
      utilizationCostPct: 0
    })

    // Calculate Entitlements & Day Values per eligible employee
    eligibleProfiles.forEach(emp => {
      const deptKey = emp.department_id || 'unassigned'
      let stat = deptStatsMap.get(deptKey)
      if (!stat) {
        stat = {
          deptId: deptKey,
          deptName: emp.departments?.name || 'Department',
          deptCode: 'DEP',
          headcount: 0,
          entitledDays: 0,
          usedDays: 0,
          remainingDays: 0,
          entitledCost: 0,
          usedCost: 0,
          remainingCost: 0,
          utilizationDaysPct: 0,
          utilizationCostPct: 0
        }
        deptStatsMap.set(deptKey, stat)
      }

      stat.headcount += 1

      // Entitlement for selected year
      const ent = calculateAnnualLeaveEntitlement(emp, selectedYear)
      const daysEntitled = ent.entitledDays || 0
      stat.entitledDays += daysEntitled

      // Formula: hourly_rate * 8 = 1 day's value
      const hourlyRate = Number(emp.hourly_rate || 0)
      const dayValue = hourlyRate * 8
      stat.entitledCost += daysEntitled * dayValue
    })

    // Calculate Approved Annual Leave Used Days & Costs
    // Query all approved annual requests for the year across all departments
    requests.forEach(req => {
      const isAnnual = (req.leave_types?.name || '').trim().toLowerCase() === 'annual leave'
      if (req.status === 'Approved' && isAnnual && isRequestInYear(req, selectedYear)) {
        const deptKey = req.department_id || 'unassigned'
        const stat = deptStatsMap.get(deptKey)
        if (stat) {
          const days = Number(req.total_days || 0)
          stat.usedDays += days

          // Determine day value from employee profile
          const emp = profileMap.get(req.employee_id)
          const hourlyRate = Number(emp?.hourly_rate || 0)
          const dayValue = hourlyRate * 8
          stat.usedCost += days * dayValue
        }
      }
    })

    // Compute remaining and percentages
    const resultList = []
    deptStatsMap.forEach(stat => {
      // Include only departments with headcount or activity
      if (stat.headcount > 0 || stat.usedDays > 0) {
        stat.remainingDays = Math.max(0, stat.entitledDays - stat.usedDays)
        stat.remainingCost = Math.max(0, stat.entitledCost - stat.usedCost)
        stat.utilizationDaysPct = stat.entitledDays > 0 ? Math.round((stat.usedDays / stat.entitledDays) * 100) : 0
        stat.utilizationCostPct = stat.entitledCost > 0 ? Math.round((stat.usedCost / stat.entitledCost) * 100) : 0
        resultList.push(stat)
      }
    })

    // Sort by Entitled Days descending
    return resultList.sort((a, b) => b.entitledDays - a.entitledDays)
  }, [departments, eligibleProfiles, requests, profileMap, selectedYear])

  // Filtered Department stats for display
  const activeDepartmentStats = useMemo(() => {
    if (selectedDeptId === 'all') return departmentalStats
    return departmentalStats.filter(d => d.deptId === selectedDeptId)
  }, [departmentalStats, selectedDeptId])

  // 2. High-Level Executive Aggregates (filtered or global)
  const executiveMetrics = useMemo(() => {
    const activeList = activeDepartmentStats

    const totalHeadcount = activeList.reduce((acc, d) => acc + d.headcount, 0)
    const totalEntitledDays = activeList.reduce((acc, d) => acc + d.entitledDays, 0)
    const totalUsedDays = activeList.reduce((acc, d) => acc + d.usedDays, 0)
    const totalRemainingDays = Math.max(0, totalEntitledDays - totalUsedDays)
    const daysUtilizationPct = totalEntitledDays > 0 ? ((totalUsedDays / totalEntitledDays) * 100).toFixed(1) : '0'

    const totalEntitledCost = activeList.reduce((acc, d) => acc + d.entitledCost, 0)
    const totalUsedCost = activeList.reduce((acc, d) => acc + d.usedCost, 0)
    const totalRemainingCost = Math.max(0, totalEntitledCost - totalUsedCost)
    const costUtilizationPct = totalEntitledCost > 0 ? ((totalUsedCost / totalEntitledCost) * 100).toFixed(1) : '0'

    return {
      totalHeadcount,
      totalEntitledDays,
      totalUsedDays,
      totalRemainingDays,
      daysUtilizationPct,
      totalEntitledCost,
      totalUsedCost,
      totalRemainingCost,
      costUtilizationPct
    }
  }, [activeDepartmentStats])

  // 3. Monthly Utilization & Cost Trend (12 Months of Selected Year)
  const monthlyTrendData = useMemo(() => {
    let cumulativeDays = 0
    let cumulativeCost = 0
    const totalEntitlement = executiveMetrics.totalEntitledDays || 1

    return MONTH_NAMES.map((monthName, idx) => {
      let monthDays = 0
      let monthCost = 0

      // Loop through approved annual requests in selected year
      approvedAnnualRequestsInYear.forEach(req => {
        const daysInMonth = getWorkingDaysInMonth(req.start_date, req.end_date, req.total_days, selectedYear, idx)
        if (daysInMonth > 0) {
          monthDays += daysInMonth
          const emp = profileMap.get(req.employee_id)
          const hourlyRate = Number(emp?.hourly_rate || 0)
          const dayVal = hourlyRate * 8
          monthCost += daysInMonth * dayVal
        }
      })

      cumulativeDays += monthDays
      cumulativeCost += monthCost
      const cumulativePct = Math.min(100, Number(((cumulativeDays / totalEntitlement) * 100).toFixed(1)))

      return {
        month: monthName,
        monthIdx: idx,
        days: monthDays,
        cost: Math.round(monthCost),
        cumulativeDays,
        cumulativeCost: Math.round(cumulativeCost),
        cumulativePct
      }
    })
  }, [approvedAnnualRequestsInYear, selectedYear, executiveMetrics.totalEntitledDays, profileMap])

  // 4. Operational Metrics (Today & Active month)
  const operationalMetrics = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    let pending = 0
    let monthApprovedCount = 0
    let monthApprovedDays = 0
    let onLeaveTodayList = []
    let totalTakenAllTypes = 0
    const typeCountMap = {}

    filteredRequests.forEach(r => {
      const totalDays = Number(r.total_days || 0)
      const typeName = r.leave_types?.name || 'Other'

      if (r.status === 'Pending') {
        pending++
      }

      if (r.status === 'Approved') {
        totalTakenAllTypes += totalDays

        // Monthly check
        if (r.start_date >= monthStart && r.start_date <= monthEnd) {
          monthApprovedCount++
          monthApprovedDays += totalDays
        }

        // Currently on leave today check
        if (r.start_date <= todayStr && r.end_date >= todayStr) {
          onLeaveTodayList.push(r)
        }

        // Distribution map
        typeCountMap[typeName] = (typeCountMap[typeName] || 0) + totalDays
      }
    })

    const dist = Object.keys(typeCountMap).map((name, index) => ({
      name,
      days: typeCountMap[name],
      color: LEAVE_COLORS[index % LEAVE_COLORS.length]
    }))

    return {
      pendingCount: pending,
      approvedThisMonth: monthApprovedCount,
      approvedDaysThisMonth: monthApprovedDays,
      activeStaffOnLeave: onLeaveTodayList,
      totalTakenAllTypes,
      typeDistribution: dist
    }
  }, [filteredRequests])

  return (
    <div className="space-y-8 font-sans pb-12">
      {/* ════════════════════════════════════════════════════════════════════════
           1. WELCOME HEADER & FILTER TOOLBAR
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              CBI Leave App / Analytics
            </span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-bold text-[#006939] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              Year {selectedYear}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1A1A1A] tracking-tight uppercase mt-0.5">
            Leave Portal &amp; Analytics
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            Departmental statutory leave balances, financial cost liabilities, and monthly utilization trends.
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm">
            <Calendar size={14} className="text-gray-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none cursor-pointer"
            >
              {LEAVE_YEARS.map(yr => (
                <option key={yr} value={yr}>Year {yr}</option>
              ))}
            </select>
          </div>

          {/* Department Filter (Admin can choose any; Supervisors view theirs) */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm">
            <Building2 size={14} className="text-gray-400" />
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              disabled={!isAdmin(profile)}
              className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed max-w-[150px] truncate"
            >
              {isAdmin(profile) && <option value="all">All Departments</option>}
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchDashboardData}
            className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh Dashboard"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <Link
            to="/leave/calendar"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs shadow-sm transition-all"
          >
            <CalendarRange size={15} className="text-[#006939]" />
            <span className="hidden sm:inline">Calendar</span>
          </Link>

          {canApplyLeave(profile) && (
            <Link
              to="/leave/requests/new"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all active:scale-[0.98]"
            >
              <PlusCircle size={15} />
              <span>Apply</span>
            </Link>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           2. EXECUTIVE FINANCIAL & UTILIZATION KPI TILES (USER REQUIREMENT 1 & 2)
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Annual Leave Cost Liability */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/70 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Total Entitled Liability ({selectedYear})
              </span>
              <div className="p-2 rounded-xl bg-emerald-100 text-[#006939]">
                <Banknote size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
              GHS {executiveMetrics.totalEntitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {executiveMetrics.totalEntitledDays.toLocaleString()} entitled days across {executiveMetrics.totalHeadcount} staff
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-400 font-medium">Statutory Rate:</span>
            <span className="font-bold text-gray-700">Hourly Rate × 8 hrs</span>
          </div>
        </div>

        {/* KPI 2: Total Leave Cost Incurred (Used Cost) */}
        <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-amber-50/30 to-white">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-100/50 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Incurred Leave Cost ({selectedYear})
              </span>
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                <TrendingUp size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-800 mt-1">
              GHS {executiveMetrics.totalUsedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-amber-700/80 mt-1">
              {executiveMetrics.totalUsedDays.toLocaleString()} approved days taken ({executiveMetrics.costUtilizationPct}% value used)
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-amber-100 flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">Days Utilization:</span>
            <span className="font-bold text-amber-800">{executiveMetrics.daysUtilizationPct}% of days</span>
          </div>
        </div>

        {/* KPI 3: Remaining Leave Liability */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-200 shadow-sm flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-emerald-50/30 to-white">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#006939]">
                Remaining Leave Liability
              </span>
              <div className="p-2 rounded-xl bg-emerald-100 text-[#006939]">
                <Activity size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#006939] mt-1">
              GHS {executiveMetrics.totalRemainingCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-emerald-800/80 mt-1">
              {executiveMetrics.totalRemainingDays.toLocaleString()} days remaining to be taken
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-emerald-100 flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">Available Balance:</span>
            <span className="font-bold text-[#006939]">{100 - Math.min(100, Math.round(Number(executiveMetrics.daysUtilizationPct)))}% outstanding</span>
          </div>
        </div>

        {/* KPI 4: Pending & Operational Approvals */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/60 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                Pending Decisions
              </span>
              <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
                <Clock size={18} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
              {operationalMetrics.pendingCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {operationalMetrics.activeStaffOnLeave.length} staff currently away today
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <Link 
              to="/leave/requests"
              className="text-xs font-bold text-[#006939] hover:underline flex items-center gap-1"
            >
              <span>Review pending</span>
              <ArrowRight size={12} />
            </Link>
            <span className="text-[11px] text-gray-400 font-semibold">
              {operationalMetrics.approvedDaysThisMonth}d approved this mo.
            </span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           3. ANALYTICS CHARTS SECTION:
              - Requirement 1: Cost of Annual leaves by department
              - Requirement 2: Total leave days in dept vs how much has been used
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: Total Leave Days: Entitled vs Used by Department (Requirement 2) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#006939] flex items-center gap-2">
                  <BarChart3 size={18} />
                  <span>Department Leave Days: Entitled vs. Used</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Comparison of total allocated statutory annual leave days against approved days utilized.
                </p>
              </div>
              <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 self-start sm:self-auto">
                Year {selectedYear}
              </span>
            </div>

            {departmentalStats.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-gray-400 text-xs">
                No departmental leave records available for {selectedYear}.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={departmentalStats} 
                    margin={{ top: 20, right: 10, left: -20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis 
                      dataKey="deptCode" 
                      tick={{ fontSize: 11, fontWeight: 600, fill: '#4B5563' }} 
                      interval={0} 
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip 
                      formatter={(val, name) => [
                        `${val} days`, 
                        name === 'entitledDays' ? 'Total Entitled Days' : 'Approved Days Used'
                      ]}
                      labelFormatter={(code) => {
                        const item = departmentalStats.find(d => d.deptCode === code)
                        return item ? `${item.deptName} (${item.headcount} staff)` : code
                      }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => value === 'entitledDays' ? 'Entitled Days' : 'Days Used'}
                      wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                    />
                    <Bar dataKey="entitledDays" fill="#006939" radius={[4, 4, 0, 0]} name="entitledDays" />
                    <Bar dataKey="usedDays" fill="#FDB913" radius={[4, 4, 0, 0]} name="usedDays" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pt-3 mt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Overall Days Utilization:</span>
            <span className="font-extrabold text-[#006939]">
              {executiveMetrics.totalUsedDays} of {executiveMetrics.totalEntitledDays} days ({executiveMetrics.daysUtilizationPct}%)
            </span>
          </div>
        </div>

        {/* CHART 2: Cost of Annual Leaves by Department (Requirement 1) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#006939] flex items-center gap-2">
                  <Banknote size={18} />
                  <span>Cost of Annual Leaves by Department (GHS)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Valuation of used leave cost vs. total entitlement liability (Hourly Rate × 8 hrs/day).
                </p>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 shrink-0 self-start sm:self-auto">
                GHS Valuation
              </span>
            </div>

            {departmentalStats.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-gray-400 text-xs">
                No departmental cost records available for {selectedYear}.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={departmentalStats} 
                    margin={{ top: 20, right: 15, left: 10, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis 
                      dataKey="deptCode" 
                      tick={{ fontSize: 11, fontWeight: 600, fill: '#4B5563' }} 
                      interval={0} 
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#6B7280' }} 
                      tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                    />
                    <Tooltip 
                      formatter={(val, name) => [
                        `GHS ${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
                        name === 'entitledCost' ? 'Total Entitlement Liability' : 'Incurred Cost'
                      ]}
                      labelFormatter={(code) => {
                        const item = departmentalStats.find(d => d.deptCode === code)
                        return item ? `${item.deptName} (${item.headcount} staff)` : code
                      }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => value === 'entitledCost' ? 'Total Entitled Cost (GHS)' : 'Incurred Cost (GHS)'}
                      wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                    />
                    <Bar dataKey="entitledCost" fill="#2563EB" radius={[4, 4, 0, 0]} name="entitledCost" />
                    <Bar dataKey="usedCost" fill="#006939" radius={[4, 4, 0, 0]} name="usedCost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="pt-3 mt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Overall Financial Liability:</span>
            <span className="font-extrabold text-[#006939]">
              GHS {executiveMetrics.totalUsedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / GHS {executiveMetrics.totalEntitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({executiveMetrics.costUtilizationPct}%)
            </span>
          </div>
        </div>

      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           4. UTILIZATION TREND (USER REQUIREMENT 3)
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-[#006939]">
                <TrendingUp size={16} />
              </span>
              <h3 className="font-black text-base text-gray-900 uppercase tracking-tight">
                Annual Leave Utilization Trend ({selectedYear})
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Monthly distribution of leave days taken and financial value incurred across the 12 calendar months.
            </p>
          </div>

          {/* Metric Selector Toggle (Days vs Cost) */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTrendMetric('days')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                trendMetric === 'days'
                  ? 'bg-white text-[#006939] shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Days Taken Trend
            </button>
            <button
              type="button"
              onClick={() => setTrendMetric('cost')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                trendMetric === 'cost'
                  ? 'bg-white text-[#006939] shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Cost Incurred (GHS)
            </button>
          </div>
        </div>

        {/* Trend Area Chart */}
        <div className="h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={monthlyTrendData} 
              margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
            >
              <defs>
                <linearGradient id="colorMonthlyDays" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#006939" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#006939" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="colorMonthlyCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600, fill: '#4B5563' }} />
              <YAxis 
                tick={{ fontSize: 11, fill: '#6B7280' }} 
                tickFormatter={(val) => trendMetric === 'cost' ? (val >= 1000 ? `${(val/1000).toFixed(0)}k` : val) : val}
              />
              <Tooltip 
                formatter={(val, name) => {
                  if (name === 'days') return [`${val} working days`, 'Days Taken in Month']
                  if (name === 'cost') return [`GHS ${Number(val).toLocaleString()}`, 'Cost Incurred in Month']
                  if (name === 'cumulativeDays') return [`${val} days`, 'Cumulative Days YTD']
                  if (name === 'cumulativeCost') return [`GHS ${Number(val).toLocaleString()}`, 'Cumulative Cost YTD']
                  if (name === 'cumulativePct') return [`${val}%`, 'Total Entitlement Utilized']
                  return [val, name]
                }}
                contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend 
                verticalAlign="top" 
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '12px' }}
              />

              {trendMetric === 'days' ? (
                <>
                  <Area 
                    type="monotone" 
                    dataKey="days" 
                    stroke="#006939" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorMonthlyDays)" 
                    name="days" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cumulativeDays" 
                    stroke="#FDB913" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="cumulativeDays" 
                  />
                </>
              ) : (
                <>
                  <Area 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="#D97706" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorMonthlyCost)" 
                    name="cost" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cumulativeCost" 
                    stroke="#2563EB" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="cumulativeCost" 
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase">Peak Utilization Month</span>
            <p className="font-extrabold text-gray-900 mt-0.5">
              {(() => {
                const max = [...monthlyTrendData].sort((a, b) => b.days - a.days)[0]
                return max && max.days > 0 ? `${max.month} (${max.days} days)` : '—'
              })()}
            </p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase">Peak Monthly Incurred Cost</span>
            <p className="font-extrabold text-amber-800 mt-0.5">
              {(() => {
                const max = [...monthlyTrendData].sort((a, b) => b.cost - a.cost)[0]
                return max && max.cost > 0 ? `${max.month} (GHS ${max.cost.toLocaleString()})` : '—'
              })()}
            </p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase">Total Days Taken YTD</span>
            <p className="font-extrabold text-[#006939] mt-0.5">
              {executiveMetrics.totalUsedDays} days ({executiveMetrics.daysUtilizationPct}% of entitlement)
            </p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase">Total Cost Incurred YTD</span>
            <p className="font-extrabold text-gray-900 mt-0.5">
              GHS {executiveMetrics.totalUsedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           5. DEPARTMENTAL SUMMARY TABLE (DAYS + FINANCIAL VALUATION)
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-base text-gray-900 uppercase tracking-tight flex items-center gap-2">
              <Building2 size={18} className="text-[#006939]" />
              <span>Departmental Leave Breakdown &amp; Financial Cost Table</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Statutory entitlement days, approved days used, and financial valuation by department.
            </p>
          </div>

          <Link
            to="/leave/balances"
            className="text-xs font-bold text-[#006939] hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            <span>View All Staff Balances</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {departmentalStats.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            No departmental data found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-5">Department</th>
                  <th className="py-3 px-4 text-center">Headcount</th>
                  <th className="py-3 px-4 text-right">Entitled Days</th>
                  <th className="py-3 px-4 text-right">Used Days</th>
                  <th className="py-3 px-4 text-right">Remaining Days</th>
                  <th className="py-3 px-4 text-center">Utilization %</th>
                  <th className="py-3 px-5 text-right">Used Cost (GHS)</th>
                  <th className="py-3 px-5 text-right">Entitled Cost (GHS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departmentalStats.map(dept => (
                  <tr key={dept.deptId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-5 font-bold text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#006939]" />
                        <span>{dept.deptName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-semibold text-gray-600">
                      {dept.headcount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-gray-900">
                      {dept.entitledDays}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-amber-700">
                      {dept.usedDays}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#006939]">
                      {dept.remainingDays}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              dept.utilizationDaysPct > 80
                                ? 'bg-rose-500'
                                : dept.utilizationDaysPct > 50
                                ? 'bg-amber-500'
                                : 'bg-[#006939]'
                            }`}
                            style={{ width: `${Math.min(100, dept.utilizationDaysPct)}%` }}
                          />
                        </div>
                        <span className="font-bold text-gray-700 text-[11px] w-8 text-right">
                          {dept.utilizationDaysPct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right font-black text-amber-800">
                      GHS {dept.usedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-5 text-right font-black text-gray-900">
                      GHS {dept.entitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50/70 border-t-2 border-emerald-200 font-black text-xs text-gray-900">
                  <td className="py-3 px-5 uppercase">Total Org</td>
                  <td className="py-3 px-4 text-center">{executiveMetrics.totalHeadcount}</td>
                  <td className="py-3 px-4 text-right">{executiveMetrics.totalEntitledDays}</td>
                  <td className="py-3 px-4 text-right text-amber-800">{executiveMetrics.totalUsedDays}</td>
                  <td className="py-3 px-4 text-right text-[#006939]">{executiveMetrics.totalRemainingDays}</td>
                  <td className="py-3 px-4 text-center text-[#006939]">{executiveMetrics.daysUtilizationPct}%</td>
                  <td className="py-3 px-5 text-right text-amber-800">
                    GHS {executiveMetrics.totalUsedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-5 text-right text-[#006939]">
                    GHS {executiveMetrics.totalEntitledCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           6. MIDDLE SECTION: CURRENTLY ON LEAVE TODAY & CATEGORY DISTRIBUTION
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Currently On Leave Today Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#006939] flex items-center gap-2">
                <UserCheck size={18} />
                <span>On Leave Today ({operationalMetrics.activeStaffOnLeave.length})</span>
              </h3>
              <span className="text-xs text-gray-400 font-semibold">
                {format(new Date(), 'dd MMM yyyy')}
              </span>
            </div>

            {operationalMetrics.activeStaffOnLeave.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400 opacity-60" />
                <p className="text-xs font-bold text-gray-600">Full Staff Presence</p>
                <p className="text-[11px] text-gray-400 mt-0.5">No employees on approved leave today in this selection.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {operationalMetrics.activeStaffOnLeave.map(req => (
                  <div key={req.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900">{req.employee_name}</p>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        {req.leave_types?.name} • Returns {format(parseISO(req.end_date), 'dd MMM')}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                      Away
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100 text-center">
            <Link
              to="/leave/calendar"
              className="text-xs font-bold text-[#006939] hover:underline"
            >
              Open Complete Roster Calendar →
            </Link>
          </div>
        </div>

        {/* Leave Category Distribution Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#006939]">
                Days Taken by Leave Category
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Breakdown of all approved leave days taken in Year {selectedYear}.
              </p>
            </div>
            <span className="text-xs text-gray-400 font-semibold">Year {selectedYear}</span>
          </div>

          {operationalMetrics.typeDistribution.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-xs">
              No approved leaves recorded yet to generate charts.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operationalMetrics.typeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(val) => [`${val} working days`, 'Approved Days']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                  />
                  <Bar dataKey="days" radius={[6, 6, 0, 0]}>
                    {operationalMetrics.typeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           7. RECENT APPLICATIONS TABLE
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-base text-gray-900 uppercase tracking-tight">
              Recent Leave Applications
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Latest applications submitted for review and approval.
            </p>
          </div>
          <Link
            to="/leave/requests"
            className="text-xs font-bold text-[#006939] hover:underline flex items-center gap-1"
          >
            <span>View All Applications</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            No leave requests recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-5">Employee</th>
                  <th className="py-3 px-5">Department</th>
                  <th className="py-3 px-5">Leave Category</th>
                  <th className="py-3 px-5">Dates</th>
                  <th className="py-3 px-5">Duration</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.slice(0, 6).map(req => {
                  const statusBadge = LEAVE_STATUS_COLORS[req.status] || LEAVE_STATUS_COLORS.Pending
                  return (
                    <tr key={req.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-5 font-bold text-gray-900">
                        {req.employee_name}
                      </td>
                      <td className="py-3.5 px-5 text-gray-600">
                        {req.departments?.name || '—'}
                      </td>
                      <td className="py-3.5 px-5 text-gray-700 font-semibold">
                        {req.leave_types?.name}
                      </td>
                      <td className="py-3.5 px-5 text-gray-600">
                        {format(parseISO(req.start_date), 'dd MMM')} – {format(parseISO(req.end_date), 'dd MMM yyyy')}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="font-bold text-[#006939]">
                          {req.total_days} days
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
                          <span>{req.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          to={`/leave/requests/${req.id}`}
                          className="inline-flex items-center gap-1 text-[#006939] font-bold hover:underline"
                        >
                          <span>Review</span>
                          <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

export default LeaveDashboardPage
