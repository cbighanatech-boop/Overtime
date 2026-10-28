import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { 
  getEntitlementBreakdown, 
  getTenureYears, 
  isEligibleForLeave,
  calculateAnnualLeaveEntitlement,
  LEAVE_YEARS
} from '../../utils/leaveHelpers'
import {
  ArrowLeft,
  User,
  Calendar,
  Building2,
  Briefcase,
  BadgeCheck,
  Tag,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  RefreshCw,
  PlusCircle,
  Layers,
  FileSpreadsheet,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export const EmployeeLeaveBalancesPage = () => {
  const { employeeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  // Year state from query param or current year
  const initialYear = Number(searchParams.get('year')) || new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(initialYear)

  // Data states
  const [employee, setEmployee] = useState(null)
  const [leaveTypes, setLeaveTypes] = useState([])
  const [balancesList, setBalancesList] = useState([])
  const [employeeRequests, setEmployeeRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAllStatutory, setShowAllStatutory] = useState(false)

  // Sync year with query param
  const handleYearChange = (year) => {
    setSelectedYear(year)
    setSearchParams({ year: String(year) })
  }

  const fetchEmployeeData = async () => {
    if (!employeeId) return
    setLoading(true)

    try {
      // 1. Fetch employee profile matching id, staff_id, or full_name
      let empQuery = supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          staff_id,
          email,
          position,
          category,
          company,
          role,
          date_of_engagement,
          native_status,
          department_id,
          created_at,
          departments (
            id,
            name
          )
        `)

      // Check if it's a valid UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId)
      if (isUUID) {
        empQuery = empQuery.or(`id.eq.${employeeId},staff_id.eq.${employeeId}`)
      } else {
        empQuery = empQuery.or(`staff_id.eq.${employeeId},full_name.ilike.%${employeeId}%`)
      }

      const { data: empData, error: empError } = await empQuery.maybeSingle()
      if (empError) throw empError

      if (!empData) {
        toast.error('Employee profile not found.')
        setEmployee(null)
        setLoading(false)
        return
      }

      setEmployee(empData)

      // 2. Fetch leave types
      const { data: ltData, error: ltError } = await supabase
        .from('leave_types')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (ltError) throw ltError
      const types = ltData || []
      setLeaveTypes(types)

      // 3. Fetch custom balances in leave_balances for this employee and year
      const staffIdentifier = empData.staff_id || empData.full_name
      const { data: customBals } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('employee_id', staffIdentifier)
        .eq('year', selectedYear)

      // 4. Fetch all leave requests for this employee in the selected year
      const yearStart = `${selectedYear}-01-01`
      const yearEnd = `${selectedYear}-12-31`
      const { data: reqData, error: reqError } = await supabase
        .from('leave_requests')
        .select(`
          *,
          leave_types (
            name
          )
        `)
        .eq('employee_id', staffIdentifier)
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd)
        .order('start_date', { ascending: false })

      if (reqError) throw reqError
      const requests = reqData || []
      setEmployeeRequests(requests)

      // 5. Calculate breakdown & remaining for each leave type
      const computedBalances = types.map((lt) => {
        const customEntry = (customBals || []).find((b) => b.leave_type_id === lt.id)

        // Dynamic formula for Annual Leave using DOE & Native status
        const breakdown = getEntitlementBreakdown(empData, lt, selectedYear)
        const entitled =
          customEntry && customEntry.entitled_days !== null && customEntry.entitled_days !== undefined
            ? Number(customEntry.entitled_days)
            : breakdown.entitled

        // Sum approved days
        const used = requests
          .filter((r) => r.leave_type_id === lt.id && r.status === 'Approved')
          .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

        // Sum pending days
        const pending = requests
          .filter((r) => r.leave_type_id === lt.id && r.status === 'Pending')
          .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

        const remaining = Math.max(0, entitled - used)
        const utilizationPct = entitled > 0 ? Math.min(100, Math.round((used / entitled) * 100)) : 0

        return {
          leaveTypeId: lt.id,
          name: lt.name,
          description: lt.description,
          defaultDays: lt.default_days,
          entitledDays: entitled,
          usedDays: used,
          pendingDays: pending,
          remainingDays: remaining,
          utilizationPct,
          breakdownText: breakdown.text,
          bonusDays: breakdown.bonusDays || 0,
          baseDays: breakdown.baseDays || entitled,
          isAnnual: (lt.name || '').trim().toLowerCase() === 'annual leave',
        }
      })

      setBalancesList(computedBalances)
    } catch (err) {
      console.error('Error loading employee leave profile:', err)
      toast.error('Failed to load employee leave details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployeeData()
  }, [employeeId, selectedYear])

  // Annual leave specific balance
  const annualLeaveBalance = balancesList.find((b) => b.isAnnual)
  const tenureYears = employee ? getTenureYears(employee, selectedYear) : 0
  const isAbanach = employee?.company?.toString().trim().toUpperCase() === 'ABANACH'

  // Total summary aggregates
  // RULE: The employee's actual entitled leave is strictly Annual Leave
  // (base 21 or 24 days + tenure anniversary bonus days).
  // Special statutory categories (e.g. 90 days maternity) are conditional benefits, NOT general entitlement days.
  const totalEntitled = annualLeaveBalance ? annualLeaveBalance.entitledDays : 0
  const totalUsed = annualLeaveBalance ? annualLeaveBalance.usedDays : 0
  const totalPending = annualLeaveBalance ? annualLeaveBalance.pendingDays : 0
  const totalRemaining = annualLeaveBalance ? annualLeaveBalance.remainingDays : 0

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={11} /> Approved
          </span>
        )
      case 'Declined':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle size={11} /> Declined
          </span>
        )
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            Cancelled
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle size={11} /> Pending
          </span>
        )
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      {/* ── Top Bar & Year Filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/leave/balances')}
            className="flex items-center justify-center p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-all"
            title="Back to all balances"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Leave App / Employee Dossier
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-xs font-bold text-[#006939] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                Year {selectedYear}
              </span>
            </div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
              {employee ? employee.full_name : 'Employee Leave Profile'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Year selector (2024 - 2035) */}
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#006939] cursor-pointer"
          >
            {LEAVE_YEARS.map((yr) => (
              <option key={yr} value={yr}>
                Year {yr}
              </option>
            ))}
          </select>

          <button
            onClick={fetchEmployeeData}
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh profile"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {(isAdmin(profile) || isRep(profile)) && employee && !isAbanach && (
            <Link
              to={`/leave/requests/new?employeeId=${employee.id}`}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.98]"
            >
              <PlusCircle size={15} />
              <span>Apply Leave</span>
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-200 shadow-sm">
          <Loader2 size={36} className="animate-spin text-[#006939] mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-700">Loading employee dossier & leave balances...</p>
          <p className="text-xs text-gray-400 mt-1">Calculating statutory formula and tenure bonuses</p>
        </div>
      ) : !employee ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-200 shadow-sm space-y-3">
          <AlertCircle size={44} className="text-amber-500 mx-auto" />
          <h2 className="text-lg font-black text-gray-900">Employee Not Found</h2>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            We couldn't locate an employee with ID "{employeeId}". Please check the ID or return to the balances list.
          </p>
          <button
            onClick={() => navigate('/leave/balances')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#006939] text-white text-xs font-bold rounded-xl shadow-md"
          >
            <ArrowLeft size={14} /> Back to Balances
          </button>
        </div>
      ) : (
        <>
          {/* Abanach Warning if applicable */}
          {isAbanach && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-800">
              <AlertCircle size={20} className="text-amber-600 shrink-0" />
              <div>
                <strong>Notice:</strong> This employee belongs to company <strong>Abanach</strong>. Employees under Abanach are excluded from the CBI Leave App policies and leave allocations.
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
               1. EMPLOYEE DOSSIER HERO CARD
          ══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden relative">
            <div className="h-2 bg-gradient-to-r from-[#006939] via-[#004D2A] to-[#FDB913]" />

            <div className="p-6 sm:p-8 space-y-6">
              {/* Header Info */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-2xl bg-[#006939]/10 text-[#006939] flex items-center justify-center font-black text-2xl shrink-0 border border-[#006939]/20 shadow-inner">
                    {employee.full_name?.charAt(0)?.toUpperCase() || 'E'}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-2xl font-black text-[#1A1A1A] tracking-tight">
                        {employee.full_name}
                      </h2>
                      {employee.staff_id && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#006939]/10 text-[#006939] font-mono text-xs font-bold border border-[#006939]/20">
                          {employee.staff_id}
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-gray-100 text-gray-700 border border-gray-200">
                        {employee.role || 'employee'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                      {employee.position && (
                        <span className="flex items-center gap-1 font-semibold text-gray-700">
                          <Briefcase size={14} className="text-gray-400" />
                          {employee.position}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        <Building2 size={14} className="text-gray-400" />
                        {employee.departments?.name || 'Department Unassigned'}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        <Tag size={14} className="text-gray-400" />
                        {employee.company || 'CBI'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Badges Column */}
                <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold border ${
                    employee.native_status === 'Non-Native'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    <BadgeCheck size={14} />
                    {employee.native_status || 'Native'} ({employee.native_status === 'Non-Native' ? '24 base days' : '21 base days'})
                  </span>

                  {employee.category && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                      <Clock size={13} className="text-gray-500" />
                      {employee.category}
                    </span>
                  )}
                </div>
              </div>

              {/* Engagement & Statutory Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-gray-50/80 border border-gray-200 text-xs">
                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">
                    Date of Engagement (DOE)
                  </span>
                  <p className="font-extrabold text-gray-900 mt-0.5 text-sm">
                    {employee.date_of_engagement
                      ? format(parseISO(employee.date_of_engagement), 'MMM dd, yyyy')
                      : 'Not recorded'}
                  </p>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">
                    Service Tenure ({selectedYear})
                  </span>
                  <p className="font-extrabold text-[#006939] mt-0.5 text-sm">
                    {employee.date_of_engagement ? `${tenureYears} Years of Service` : '—'}
                  </p>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">
                    Annual Leave Entitlement
                  </span>
                  <p className="font-extrabold text-gray-900 mt-0.5 text-sm">
                    {annualLeaveBalance ? `${annualLeaveBalance.entitledDays} Days` : '21 Days'}
                  </p>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">
                    Email Address
                  </span>
                  <p className="font-semibold text-gray-600 truncate mt-0.5" title={employee.email}>
                    {employee.email || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Statutory Formula Explanation Callout */}
              {annualLeaveBalance && (
                <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs">
                  <div className="p-2 bg-[#006939] text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
                    <Sparkles size={16} />
                  </div>
                  <div className="space-y-0.5 flex-1">
                    <p className="font-bold text-[#006939] uppercase tracking-wider">
                      Statutory Annual Leave Formula Breakdown
                    </p>
                    <p className="text-gray-700 leading-relaxed">
                      <strong>Base Entitlement:</strong> {annualLeaveBalance.baseDays} days ({employee.native_status || 'Native'}).{' '}
                      {annualLeaveBalance.bonusDays > 0 ? (
                        <span className="text-emerald-800 font-semibold">
                          <strong>Tenure Bonus:</strong> +{annualLeaveBalance.bonusDays} extra days awarded for {tenureYears} years of service (DOE: {employee.date_of_engagement}).
                        </span>
                      ) : (
                        <span className="text-gray-600">
                          Employees reach +3 bonus days at 3–4 years of service and +4 bonus days at 5+ years.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
               2. SUMMARY KPI METRIC TILES
          ══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Total Entitled ({selectedYear})
              </span>
              <p className="text-3xl font-black text-gray-900 mt-1">
                {totalEntitled} <span className="text-xs font-semibold text-gray-400">days</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Annual Leave {annualLeaveBalance?.bonusDays > 0 ? `(incl. +${annualLeaveBalance.bonusDays} anniversary)` : '(statutory)'}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                Approved / Taken
              </span>
              <p className="text-3xl font-black text-amber-700 mt-1">
                {totalUsed} <span className="text-xs font-semibold text-gray-400">days</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Annual leave utilized</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                Pending Requests
              </span>
              <p className="text-3xl font-black text-blue-700 mt-1">
                {totalPending} <span className="text-xs font-semibold text-gray-400">days</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Awaiting approval</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
              <span className="text-[11px] font-bold text-[#006939] uppercase tracking-wider block">
                Total Available Days
              </span>
              <p className="text-3xl font-black text-[#006939] mt-1">
                {totalRemaining} <span className="text-xs font-semibold text-[#006939]/70">days</span>
              </p>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium">Ready to be utilized</p>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
               3. LEAVE BALANCES (ANNUAL LEAVE + UTILIZED CATEGORIES)
          ══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-[#1A1A1A] uppercase tracking-tight">
                  Leave Entitlements &amp; Balances ({selectedYear})
                </h3>
                <p className="text-xs text-gray-500">
                  Annual Leave is the statutory entitlement. Other categories are tracked and displayed only when utilized.
                </p>
              </div>

              {balancesList.filter(b => !b.isAnnual && b.usedDays <= 0 && b.pendingDays <= 0).length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllStatutory(!showAllStatutory)}
                  className="text-xs font-bold text-[#006939] hover:underline self-start sm:self-auto"
                >
                  {showAllStatutory ? 'Hide Unutilized Categories' : `Show All Statutory Categories (${balancesList.length})`}
                </button>
              )}
            </div>

            {/* Annual Leave - Primary Entitlement Hero Tile */}
            {annualLeaveBalance && (
              <div className="bg-gradient-to-br from-emerald-50/60 to-white rounded-2xl border-2 border-[#006939]/30 p-6 shadow-md relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#006939] text-white">
                        Actual Entitlement
                      </span>
                      <h4 className="text-lg font-black text-gray-900">
                        {annualLeaveBalance.name}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-600">
                      {annualLeaveBalance.breakdownText || 'Standard annual statutory leave'}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[11px] text-gray-400 font-bold uppercase block">Available Balance</span>
                      <span className="text-3xl font-black text-[#006939]">
                        {annualLeaveBalance.remainingDays} <span className="text-sm font-bold text-gray-400">days</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-gray-600">
                      {annualLeaveBalance.usedDays} days used of {annualLeaveBalance.entitledDays} entitled days
                    </span>
                    <span className={annualLeaveBalance.utilizationPct > 80 ? 'text-rose-600 font-bold' : 'text-gray-700'}>
                      {annualLeaveBalance.utilizationPct}% utilized
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        annualLeaveBalance.utilizationPct > 80
                          ? 'bg-rose-500'
                          : annualLeaveBalance.utilizationPct > 50
                          ? 'bg-amber-500'
                          : 'bg-[#006939]'
                      }`}
                      style={{ width: `${annualLeaveBalance.utilizationPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3 text-gray-600">
                    <span>Base: <strong>{annualLeaveBalance.baseDays} d</strong></span>
                    <span>•</span>
                    <span>Bonus: <strong className="text-emerald-700">+{annualLeaveBalance.bonusDays} d</strong></span>
                    <span>•</span>
                    <span>Approved: <strong>{annualLeaveBalance.usedDays} d</strong></span>
                    {annualLeaveBalance.pendingDays > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-blue-700 font-bold">Pending: {annualLeaveBalance.pendingDays} d</span>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/60 px-2.5 py-0.5 rounded-full">
                    {annualLeaveBalance.remainingDays} days ready for booking
                  </span>
                </div>
              </div>
            )}

            {/* Other Categories Section: Only Displayed When Utilized (or when showAllStatutory is true) */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
                Special Leave Categories (Displayed When Utilized)
              </h4>

              {balancesList.filter(b => !b.isAnnual && (b.usedDays > 0 || b.pendingDays > 0 || showAllStatutory)).length === 0 ? (
                <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl text-center space-y-1">
                  <p className="text-xs font-bold text-gray-700">No Other Leave Categories Utilized in {selectedYear}</p>
                  <p className="text-[11px] text-gray-500 max-w-lg mx-auto">
                    Under company policy, Annual Leave is the only default credited entitlement. Other statutory categories (Sick, Casual, Maternity, Compassionate, etc.) will appear here automatically as soon as an application is placed.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {balancesList
                    .filter(b => !b.isAnnual && (b.usedDays > 0 || b.pendingDays > 0 || showAllStatutory))
                    .map((b) => (
                      <div
                        key={b.leaveTypeId}
                        className={`bg-white rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${
                          b.usedDays > 0 ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-extrabold text-gray-900">{b.name}</h5>
                              {b.usedDays > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Utilized
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                              {b.description || 'Statutory employee leave benefit'}
                            </p>
                          </div>

                          <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-50 text-[#006939] border border-emerald-100 shrink-0">
                            {b.remainingDays} d left
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-4 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span className="text-gray-500">
                              {b.usedDays} used of {b.entitledDays} days
                            </span>
                            <span className={b.utilizationPct > 80 ? 'text-rose-600' : 'text-gray-700'}>
                              {b.utilizationPct}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                b.utilizationPct > 80
                                  ? 'bg-rose-500'
                                  : b.utilizationPct > 50
                                  ? 'bg-amber-500'
                                  : 'bg-[#006939]'
                              }`}
                              style={{ width: `${b.utilizationPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px]">
                          <span className="text-gray-400">Statutory Limit: <strong>{b.entitledDays} days</strong></span>
                          <span className="text-gray-600 font-semibold">{b.remainingDays} days balance</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
               4. LEAVE REQUESTS HISTORY FOR THIS EMPLOYEE
          ══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-[#1A1A1A] uppercase tracking-tight">
                  Leave Applications History ({selectedYear})
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  All time-off requests submitted for {employee.full_name} in {selectedYear}.
                </p>
              </div>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full self-start sm:self-auto">
                {employeeRequests.length} Record{employeeRequests.length !== 1 ? 's' : ''}
              </span>
            </div>

            {employeeRequests.length === 0 ? (
              <div className="p-12 text-center text-gray-400 space-y-2">
                <Calendar size={36} className="mx-auto text-gray-300" />
                <p className="text-sm font-bold text-gray-600">No Leave Requests Found</p>
                <p className="text-xs text-gray-400">
                  {employee.full_name} has not placed any leave requests in year {selectedYear}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                      <th className="py-3.5 px-6">Leave Category</th>
                      <th className="py-3.5 px-6">Leave Period</th>
                      <th className="py-3.5 px-6">Days</th>
                      <th className="py-3.5 px-6">Status</th>
                      <th className="py-3.5 px-6">Reason</th>
                      <th className="py-3.5 px-6">Supervisor Note</th>
                      <th className="py-3.5 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employeeRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3.5 px-6 font-bold text-gray-800">
                          {req.leave_types?.name || 'Leave'}
                        </td>
                        <td className="py-3.5 px-6 text-gray-600 font-mono text-xs">
                          {req.start_date} → {req.end_date}
                        </td>
                        <td className="py-3.5 px-6 font-black text-gray-900">
                          {req.total_days} d
                        </td>
                        <td className="py-3.5 px-6">
                          {getStatusBadge(req.status)}
                        </td>
                        <td className="py-3.5 px-6 text-gray-600 max-w-xs truncate" title={req.reason}>
                          {req.reason}
                        </td>
                        <td className="py-3.5 px-6 text-gray-500 max-w-xs truncate" title={req.review_comment || ''}>
                          {req.review_comment || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <Link
                            to={`/leave/requests/${req.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#006939] hover:underline"
                          >
                            <span>Details</span>
                            <ChevronRight size={13} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default EmployeeLeaveBalancesPage

