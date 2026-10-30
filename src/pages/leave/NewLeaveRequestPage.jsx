import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { 
  canApplyLeave, 
  calculateWorkingDays, 
  getHolidaysInRange, 
  isEligibleForLeave, 
  getEntitlementBreakdown,
  canUtilizeCasualLeave 
} from '../../utils/leaveHelpers'
import { notifySupervisorsOfLeaveRequest } from '../../utils/leaveNotificationService'
import { 
  ArrowLeft, 
  CalendarDays, 
  User, 
  Clock, 
  FileText, 
  Phone, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Save, 
  Info,
  CalendarCheck,
  Mail,
  Sparkles,
  AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, addDays } from 'date-fns'

export const NewLeaveRequestPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Data sources
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form State
  const [searchParams] = useSearchParams()
  const preselectedEmpId = searchParams.get('employeeId') || ''
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(preselectedEmpId)
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 5), 'yyyy-MM-dd'))
  const [totalDays, setTotalDays] = useState('5')
  const [reason, setReason] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [reliefStaffName, setReliefStaffName] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [submittedNotice, setSubmittedNotice] = useState(null)

  // Balance lookup for the selected employee & leave type
  const [balanceInfo, setBalanceInfo] = useState(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [annualStatus, setAnnualStatus] = useState({
    entitled: 0,
    approved: 0,
    remaining: 0,
    canUtilizeCasual: true,
    reason: ''
  })

  // Load active employees (excluding Abanach), leave types, and registered holidays
  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return
      setLoadingData(true)
      try {
        // 1. Fetch active employees - EXCLUDING Abanach
        let empQuery = supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            staff_id,
            department_id,
            company,
            date_of_engagement,
            native_status,
            departments (name)
          `)
          .eq('is_active', true)
          .neq('company', 'Abanach') // Exclude Abanach employees
          .order('full_name')

        // Reps can only place requests for staff in their own department
        if (isRep(profile) && profile.department_id) {
          empQuery = empQuery.eq('department_id', profile.department_id)
        }

        const { data: empData, error: empError } = await empQuery
        if (empError) throw empError
        
        // Extra safeguard: filter by isEligibleForLeave
        const eligibleEmployees = (empData || []).filter(isEligibleForLeave)
        setEmployees(eligibleEmployees)

        if (preselectedEmpId && eligibleEmployees.some(e => e.id === preselectedEmpId || e.staff_id === preselectedEmpId)) {
          const matched = eligibleEmployees.find(e => e.id === preselectedEmpId || e.staff_id === preselectedEmpId)
          if (matched) setSelectedEmployeeId(matched.id)
        }

        // 2. Fetch active leave types
        const { data: ltData, error: ltError } = await supabase
          .from('leave_types')
          .select('*')
          .eq('is_active', true)
          .order('name')

        if (ltError) {
          console.warn('leave_types table issue:', ltError.message)
        } else {
          setLeaveTypes(ltData || [])
          if (ltData && ltData.length > 0) {
            setSelectedLeaveTypeId(ltData[0].id)
          }
        }

        // 3. Fetch registered public holidays from Overtime App
        const { data: holData } = await supabase
          .from('holidays')
          .select('holiday_date, name')
          .order('holiday_date', { ascending: true })

        setHolidays(holData || [])

      } catch (err) {
        console.error('Failed to load form prerequisites:', err.message)
        toast.error('Could not load employees or leave types.')
      } finally {
        setLoadingData(false)
      }
    }

    fetchData()
  }, [profile])

  // Recalculate working days whenever dates or holidays change
  // Excludes weekends AND registered holidays from the Overtime App
  useEffect(() => {
    if (startDate && endDate) {
      const holidayDates = holidays.map(h => h.holiday_date)
      const days = calculateWorkingDays(startDate, endDate, holidayDates)
      setTotalDays(String(days))
    }
  }, [startDate, endDate, holidays])

  // Detect holidays falling within the selected period
  const holidaysInRange = getHolidaysInRange(startDate, endDate, holidays)

  // Lookup leave balance and annual leave status when employee, leave type, or dates change
  useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedEmployeeId) {
        setBalanceInfo(null)
        setAnnualStatus({ entitled: 0, approved: 0, remaining: 0, canUtilizeCasual: true, reason: '' })
        return
      }

      const emp = employees.find(e => e.id === selectedEmployeeId)
      if (!emp) return

      setLoadingBalance(true)
      try {
        const staffIdentifier = emp.staff_id || emp.full_name
        const currentYear = new Date(startDate || new Date()).getFullYear()

        // 1. Fetch all leave requests for this employee in currentYear
        const { data: yearRequests } = await supabase
          .from('leave_requests')
          .select('total_days, status, leave_type_id')
          .eq('employee_id', staffIdentifier)
          .gte('start_date', `${currentYear}-01-01`)
          .lte('start_date', `${currentYear}-12-31`)
          .in('status', ['Approved', 'Pending'])

        // 2. Fetch custom balances in leave_balances for this employee and currentYear
        const { data: userCustomBals } = await supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', staffIdentifier)
          .eq('year', currentYear)

        // 3. Compute Annual Leave entitlement & remaining (for Casual Leave rule & preview)
        const annualType = leaveTypes.find(lt => (lt.name || '').trim().toLowerCase() === 'annual leave')
        const annualBreakdown = annualType ? getEntitlementBreakdown(emp, annualType, currentYear) : { entitled: 21 }
        const annualCustom = (userCustomBals || []).find(b => b.leave_type_id === annualType?.id)
        const annualEntitled = annualCustom && annualCustom.entitled_days !== null && annualCustom.entitled_days !== undefined
          ? Number(annualCustom.entitled_days)
          : annualBreakdown.entitled

        const approvedAnnualDays = (yearRequests || [])
          .filter(r => r.leave_type_id === annualType?.id && r.status === 'Approved')
          .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

        const annualRemaining = Math.max(0, annualEntitled - approvedAnnualDays)
        const casualEligibility = canUtilizeCasualLeave(annualEntitled, approvedAnnualDays)

        setAnnualStatus({
          entitled: annualEntitled,
          approved: approvedAnnualDays,
          remaining: annualRemaining,
          canUtilizeCasual: casualEligibility.canUtilize,
          reason: casualEligibility.reason
        })

        // 4. Compute balance for the currently selected leave type
        if (selectedLeaveTypeId) {
          const chosenType = leaveTypes.find(lt => lt.id === selectedLeaveTypeId)
          const breakdown = getEntitlementBreakdown(emp, chosenType, currentYear)
          const typeCustom = (userCustomBals || []).find(b => b.leave_type_id === selectedLeaveTypeId)

          const entitled = typeCustom && typeCustom.entitled_days !== null && typeCustom.entitled_days !== undefined
            ? Number(typeCustom.entitled_days)
            : breakdown.entitled

          const approvedDays = (yearRequests || [])
            .filter(r => r.leave_type_id === selectedLeaveTypeId && r.status === 'Approved')
            .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

          const pendingDays = (yearRequests || [])
            .filter(r => r.leave_type_id === selectedLeaveTypeId && r.status === 'Pending')
            .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

          const remaining = Math.max(0, entitled - approvedDays)
          const isAnnual = (chosenType?.name || '').trim().toLowerCase() === 'annual leave'
          const isCasual = (chosenType?.name || '').trim().toLowerCase() === 'casual leave'

          setBalanceInfo({
            entitled,
            approvedDays,
            pendingDays,
            remaining,
            breakdownText: breakdown.text,
            bonusDays: breakdown.bonusDays,
            baseDays: breakdown.baseDays,
            accumulatedDays: breakdown.accumulatedDays ?? 0,
            monthsSpent: breakdown.monthsSpent ?? 0,
            isProrated: breakdown.isProrated ?? false,
            monthsFromDoeToEndOfYear: breakdown.monthsFromDoeToEndOfYear ?? 12,
            isAnnual,
            isCasual
          })
        } else {
          setBalanceInfo(null)
        }
      } catch (err) {
        console.warn('Balance lookup issue:', err.message)
      } finally {
        setLoadingBalance(false)
      }
    }

    fetchBalance()
  }, [selectedEmployeeId, selectedLeaveTypeId, employees, leaveTypes, startDate])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!canApplyLeave(profile)) {
      toast.error('Only Department Representatives and Administrators can submit leave requests.')
      return
    }

    if (!selectedEmployeeId) {
      toast.error('Please select an employee for this leave request.')
      return
    }

    const employeeObj = employees.find(e => e.id === selectedEmployeeId)
    if (!employeeObj) {
      toast.error('Selected employee details not found.')
      return
    }

    // Explicit check: Exclude Abanach employees
    if (!isEligibleForLeave(employeeObj)) {
      toast.error('Employees from company "Abanach" are excluded from the Leave App.')
      return
    }

    if (!selectedLeaveTypeId) {
      toast.error('Please select a leave category.')
      return
    }

    if (!startDate || !endDate) {
      toast.error('Please provide both start and end dates.')
      return
    }

    if (new Date(endDate) < new Date(startDate)) {
      toast.error('End date cannot be earlier than start date.')
      return
    }

    const daysNum = parseFloat(totalDays)
    if (isNaN(daysNum) || daysNum <= 0) {
      toast.error('Total leave days must be greater than zero. (Check if dates only fall on weekends or holidays).')
      return
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason or purpose for the leave.')
      return
    }

    const selectedType = leaveTypes.find(lt => lt.id === selectedLeaveTypeId)
    const isCasual = (selectedType?.name || '').trim().toLowerCase() === 'casual leave'
    const requestYear = new Date(startDate).getFullYear()

    // RULE: Casual Leave can ONLY be utilized when the employee has utilized all of their annual leave entitlement for the year.
    if (isCasual && annualStatus.remaining > 0) {
      toast.error(
        `Casual Leave restriction: Casual leave can only be utilized after all Annual Leave entitlement for the year has been exhausted. ${employeeObj.full_name} still has ${annualStatus.remaining} day(s) of Annual Leave remaining for ${requestYear}.`,
        { duration: 6500 }
      )
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        employee_name: employeeObj.full_name,
        employee_id: employeeObj.staff_id || employeeObj.id,
        department_id: employeeObj.department_id || profile.department_id,
        leave_type_id: selectedLeaveTypeId,
        start_date: startDate,
        end_date: endDate,
        total_days: daysNum,
        reason: reason.trim(),
        contact_phone: contactPhone.trim() || null,
        relief_staff_name: reliefStaffName.trim() || null,
        handover_notes: handoverNotes.trim() || null,
        status: 'Pending',
        captured_by: profile.id,
        captured_at: new Date().toISOString()
      }

      const { data: insertedData, error } = await supabase
        .from('leave_requests')
        .insert(payload)
        .select()

      if (error) throw error

      const createdRequest = (insertedData && insertedData[0]) || payload

      // DISPATCH EMAIL NOTIFICATION TO DEPARTMENT SUPERVISOR
      // Sends: employee name, period, and current outstanding leave balance
      const notifyResult = await notifySupervisorsOfLeaveRequest({
        leaveRequest: createdRequest,
        employee: employeeObj,
        leaveType: selectedType,
        departmentName: employeeObj.departments?.name,
        outstandingBalance: balanceInfo ? balanceInfo.remaining : undefined,
        repProfile: profile
      })

      if (notifyResult?.mailtoLink) {
        setSubmittedNotice({
          request: createdRequest,
          notifyResult,
          employee: employeeObj
        })
      } else {
        if (notifyResult?.recipients?.length > 0) {
          toast.success(
            `Leave application submitted! Notification sent to Supervisor: ${notifyResult.recipients[0]}`,
            { duration: 5500 }
          )
        } else {
          toast.success(`Leave application for ${employeeObj.full_name} submitted successfully! Awaiting supervisor review.`)
        }
        navigate('/leave/requests')
      }
    } catch (err) {
      console.error('Leave submit error:', err.message)
      toast.error(err.message || 'Failed to submit leave request.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId)
  const selectedType = leaveTypes.find(lt => lt.id === selectedLeaveTypeId)

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/leave/requests')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:text-[#006939] hover:bg-gray-50 text-xs font-bold shadow-sm transition-all"
        >
          <ArrowLeft size={16} />
          <span>Back to Requests</span>
        </button>

        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
          Captured By: <strong className="text-gray-800">{profile?.full_name}</strong> ({profile?.role})
        </span>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
        {/* Card Header */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl">
              <CalendarCheck size={28} className="text-[#FDB913]" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase">
                Apply for Employee Leave
              </h1>
              <p className="text-sm text-white/80 mt-0.5">
                Representative portal: Submit formal time off request. Supervisor will be notified via email with outstanding balance.
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          
          {/* SECTION 1: EMPLOYEE SELECTION (EXCLUDES ABANACH) */}
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <User size={18} className="text-[#006939]" />
                <h2 className="text-sm font-extrabold text-[#006939] uppercase tracking-wider">
                  1. Select Colleague / Employee
                </h2>
              </div>
              <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200">
                CBI Staff Only (Excludes Abanach)
              </span>
            </div>

            {loadingData ? (
              <div className="p-6 bg-gray-50 rounded-xl flex items-center justify-center gap-2 text-gray-500 text-xs font-semibold">
                <Loader2 size={16} className="animate-spin text-[#006939]" />
                <span>Loading eligible department employees...</span>
              </div>
            ) : employees.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>No eligible CBI employees found in your department. (Note: Staff under "Abanach" are excluded from Leave App).</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Employee Name *
                  </label>
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white font-medium text-gray-800"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} {emp.staff_id ? `(${emp.staff_id})` : ''} - {emp.departments?.name || 'CBI'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEmployee && (
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-xl flex flex-col justify-center">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Employee Profile</p>
                    <p className="text-sm font-extrabold text-[#006939] mt-0.5">{selectedEmployee.full_name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 flex-wrap">
                      <span>Staff ID: <strong>{selectedEmployee.staff_id || 'N/A'}</strong></span>
                      <span>•</span>
                      <span>Origin: <strong className={selectedEmployee.native_status === 'Non-Native' ? 'text-purple-700' : 'text-emerald-700'}>{selectedEmployee.native_status || 'Native'}</strong></span>
                      {selectedEmployee.date_of_engagement && (
                        <>
                          <span>•</span>
                          <span>DOE: <strong>{selectedEmployee.date_of_engagement}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 2: LEAVE CATEGORY & BALANCE PREVIEW */}
          <div>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
              <CalendarDays size={18} className="text-[#006939]" />
              <h2 className="text-sm font-extrabold text-[#006939] uppercase tracking-wider">
                2. Leave Category & Entitlement
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Leave Type *
                </label>
                <select
                  required
                  value={selectedLeaveTypeId}
                  onChange={(e) => setSelectedLeaveTypeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white font-medium text-gray-800"
                >
                  <option value="">-- Choose Leave Type --</option>
                  {leaveTypes.map(lt => {
                    const isThisCasual = (lt.name || '').trim().toLowerCase() === 'casual leave'
                    const isBlocked = isThisCasual && annualStatus.remaining > 0
                    return (
                      <option key={lt.id} value={lt.id}>
                        {lt.name} ({lt.default_days} days/year){isBlocked ? ` — ⚠️ Annual Leave must be exhausted first (${annualStatus.remaining}d left)` : ''}
                      </option>
                    )
                  })}
                </select>
                {selectedType?.description && (
                  <p className="text-[11px] text-gray-500 mt-1 italic">
                    {selectedType.description}
                  </p>
                )}

                {/* Casual Leave Restriction Warning Alert */}
                {(selectedType?.name || '').trim().toLowerCase() === 'casual leave' && annualStatus.remaining > 0 && (
                  <div className="mt-3 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-2.5 text-xs">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-extrabold uppercase tracking-wider text-amber-900">
                        Casual Leave Restriction
                      </p>
                      <p className="text-amber-800 leading-relaxed">
                        Casual leave can only be utilized when the employee has utilized all of their annual leave entitlement for the year.
                        {selectedEmployee && (
                          <> <strong>{selectedEmployee.full_name}</strong> currently has <strong>{annualStatus.remaining} day(s)</strong> of Annual Leave remaining for {new Date(startDate || new Date()).getFullYear()}.</>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Balance Card */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    {balanceInfo?.isAnnual ? 'Annual Leave Entitlement & Accrual' : 'Category Entitlement'}
                  </span>
                  {loadingBalance && <Loader2 size={12} className="animate-spin text-[#006939]" />}
                </div>

                {balanceInfo ? (
                  <>
                    <div className={`mt-2 grid ${balanceInfo.isAnnual ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-2 text-center`}>
                      <div className="p-2 bg-white rounded-lg border border-gray-100 flex flex-col justify-between">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Entitled</p>
                        <p className="text-base font-black text-gray-800 mt-0.5">{balanceInfo.entitled}</p>
                        {balanceInfo.isProrated ? (
                          <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200 mt-0.5">
                            Prorated
                          </span>
                        ) : <span className="text-[9px] text-gray-400">Annual</span>}
                      </div>

                      {balanceInfo.isAnnual && (
                        <div className="p-2 bg-blue-50/60 rounded-lg border border-blue-200 flex flex-col justify-between">
                          <p className="text-[10px] text-blue-800 font-bold uppercase">Accumulated</p>
                          <p className="text-base font-black text-blue-900 mt-0.5">{balanceInfo.accumulatedDays}</p>
                          <span className="text-[9px] text-blue-600 font-semibold mt-0.5">
                            To Date ({balanceInfo.monthsSpent} mos)
                          </span>
                        </div>
                      )}

                      <div className="p-2 bg-white rounded-lg border border-gray-100 flex flex-col justify-between">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Approved</p>
                        <p className="text-base font-black text-emerald-700 mt-0.5">{balanceInfo.approvedDays}</p>
                        <span className="text-[9px] text-gray-400 mt-0.5">Used</span>
                      </div>

                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 flex flex-col justify-between">
                        <p className="text-[10px] text-emerald-800 font-bold uppercase">Available</p>
                        <p className="text-base font-black text-[#006939] mt-0.5">{balanceInfo.remaining}</p>
                        <span className="text-[9px] text-emerald-700 font-semibold mt-0.5">Remaining</span>
                      </div>
                    </div>
                    {balanceInfo.breakdownText && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-2 bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-100">
                        ℹ️ {balanceInfo.breakdownText}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 mt-3 italic">
                    Select an employee and leave category to preview annual balance.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: DATES & TOTAL DAYS (EXCLUDES HOLIDAYS & WEEKENDS) */}
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-[#006939]" />
                <h2 className="text-sm font-extrabold text-[#006939] uppercase tracking-wider">
                  3. Leave Dates & Duration
                </h2>
              </div>
              <span className="text-[11px] font-bold text-[#006939] bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                Official Holidays & Weekends Excluded
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  End Date (Inclusive) *
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Chargeable Leave Days *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={totalDays}
                    onChange={(e) => setTotalDays(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] font-bold text-[#006939]"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-400 font-semibold">
                    Days
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Excludes weekends and registered holidays.
                </p>
              </div>
            </div>

            {/* Notification if public holidays fall in range */}
            {holidaysInRange.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-blue-900 text-xs">
                <Sparkles size={16} className="text-[#FDB913] shrink-0" />
                <span>
                  <strong>{holidaysInRange.length} Public Holiday(s) Excluded: </strong>
                  {holidaysInRange.map(h => `${h.name || 'Holiday'} (${h.holiday_date})`).join(', ')}. These days are not deducted from the employee's leave balance!
                </span>
              </div>
            )}

            {/* Warning if requested days exceeds available */}
            {balanceInfo && parseFloat(totalDays) > balanceInfo.remaining && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-xs">
                <AlertCircle size={16} className="shrink-0 text-amber-600" />
                <span>
                  Notice: Requested duration (<strong>{totalDays} days</strong>) exceeds available balance (<strong>{balanceInfo.remaining} days</strong>). The supervisor will be informed of this outstanding balance in the email notification.
                </span>
              </div>
            )}
          </div>

          {/* SECTION 4: REASON & RELIEF / HANDOVER */}
          <div>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
              <FileText size={18} className="text-[#006939]" />
              <h2 className="text-sm font-extrabold text-[#006939] uppercase tracking-wider">
                4. Purpose & Handover Details
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Reason for Leave *
                </label>
                <textarea
                  required
                  rows="2"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Annual scheduled rest, medical consultation, urgent family affair..."
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                ></textarea>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Relief / Cover Colleague
                  </label>
                  <input
                    type="text"
                    value={reliefStaffName}
                    onChange={(e) => setReliefStaffName(e.target.value)}
                    placeholder="e.g. Kwesi Mensah"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Colleague covering assigned duties.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Reachable phone number while away.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Handover Notes / Instructions (Optional)
                </label>
                <textarea
                  rows="2"
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="Notes on pending tasks or instructions for the team..."
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Mail size={16} className="text-[#006939] shrink-0" />
              <span>
                Submission automatically emails the Department Supervisor with employee details, period, and current leave balance.
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => navigate('/leave/requests')}
                disabled={submitting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              {(() => {
                const isCasualSelected = (selectedType?.name || '').trim().toLowerCase() === 'casual leave'
                const casualBlocked = isCasualSelected && annualStatus.remaining > 0

                return (
                  <button
                    type="submit"
                    disabled={submitting || casualBlocked}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] ${
                      casualBlocked
                        ? 'bg-amber-600 hover:bg-amber-600 cursor-not-allowed opacity-90'
                        : 'bg-[#006939] hover:bg-[#004D2A] disabled:opacity-50'
                    }`}
                    title={casualBlocked ? `Casual leave can only be utilized once all ${annualStatus.remaining} remaining Annual Leave days are exhausted` : ''}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Sending Application & Email...</span>
                      </>
                    ) : casualBlocked ? (
                      <>
                        <AlertTriangle size={16} />
                        <span>Casual Leave Blocked ({annualStatus.remaining}d Annual Leave Left)</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>Submit & Notify Supervisor</span>
                      </>
                    )}
                  </button>
                )
              })()}
            </div>
          </div>

        </form>
      </div>
      {/* Rep to Supervisor Email Dispatch Confirmation Modal */}
      {submittedNotice && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl border border-gray-100">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#006939] flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
              <CheckCircle2 size={32} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-gray-900 tracking-tight">
                Leave Application Submitted!
              </h3>
              <p className="text-xs text-gray-500">
                Application for <strong>{submittedNotice.employee.full_name}</strong> has been created.
              </p>
            </div>

            {/* Email Dispatch Info Box */}
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50/50 rounded-2xl border border-emerald-200 text-xs space-y-2.5">
              <div className="flex items-center gap-2 text-[#006939] font-bold uppercase tracking-wider text-[11px]">
                <Mail size={15} />
                <span>Email to Supervisor from Rep User</span>
              </div>

              <div className="space-y-1 text-gray-700">
                <p>
                  <strong className="text-gray-900">From Rep:</strong> {profile?.full_name} {profile?.email ? `(${profile.email})` : ''}
                </p>
                <p>
                  <strong className="text-gray-900">To Supervisor:</strong> {submittedNotice.notifyResult?.recipients?.[0] || 'Department Supervisor'}
                </p>
                <p>
                  <strong className="text-gray-900">Period:</strong> {submittedNotice.request.start_date} to {submittedNotice.request.end_date} ({submittedNotice.request.total_days} Days)
                </p>
                <p>
                  <strong className="text-gray-900">Outstanding Balance:</strong> {balanceInfo ? `${balanceInfo.remaining} days remaining` : 'Annual Leave'}
                </p>
              </div>

              <p className="text-[11px] text-gray-500 italic pt-1 border-t border-emerald-100">
                The supervisor will receive this notification with employee details, period, and current outstanding leave balance.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              {submittedNotice.notifyResult?.mailtoLink && (
                <a
                  href={submittedNotice.notifyResult.mailtoLink}
                  onClick={() => {
                    toast.success('Email opened in your mail client!')
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#006939] hover:bg-[#004D2A] text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.98]"
                >
                  <Mail size={15} className="text-[#FDB913]" />
                  <span>Send Email from My Email App</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => navigate('/leave/requests')}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors text-center"
              >
                Go to Leave Requests
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewLeaveRequestPage
