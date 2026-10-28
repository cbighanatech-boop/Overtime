import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { canApplyLeave, calculateWorkingDays } from '../../utils/leaveHelpers'
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
  CalendarCheck
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, addDays } from 'date-fns'

export const NewLeaveRequestPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Data sources
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 5), 'yyyy-MM-dd'))
  const [totalDays, setTotalDays] = useState('5')
  const [reason, setReason] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [reliefStaffName, setReliefStaffName] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')

  // Balance lookup for the selected employee & leave type
  const [balanceInfo, setBalanceInfo] = useState(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Load active employees and leave types
  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return
      setLoadingData(true)
      try {
        // 1. Fetch active employees
        let empQuery = supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            staff_id,
            department_id,
            company,
            departments (name)
          `)
          .eq('is_active', true)
          .order('full_name')

        // Reps can only place requests for staff in their own department
        if (isRep(profile) && profile.department_id) {
          empQuery = empQuery.eq('department_id', profile.department_id)
        }

        const { data: empData, error: empError } = await empQuery
        if (empError) throw empError
        setEmployees(empData || [])

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
      } catch (err) {
        console.error('Failed to load form prerequisites:', err.message)
        toast.error('Could not load employees or leave types.')
      } finally {
        setLoadingData(false)
      }
    }

    fetchData()
  }, [profile])

  // Recalculate working days whenever dates change
  useEffect(() => {
    if (startDate && endDate) {
      const days = calculateWorkingDays(startDate, endDate)
      setTotalDays(String(days))
    }
  }, [startDate, endDate])

  // Lookup leave balance when employee or leave type changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedEmployeeId || !selectedLeaveTypeId) {
        setBalanceInfo(null)
        return
      }

      const emp = employees.find(e => e.id === selectedEmployeeId)
      if (!emp) return

      setLoadingBalance(true)
      try {
        const staffIdentifier = emp.staff_id || emp.full_name
        const currentYear = new Date(startDate || new Date()).getFullYear()

        // 1. Check existing balance record in leave_balances
        const { data: balData } = await supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', staffIdentifier)
          .eq('leave_type_id', selectedLeaveTypeId)
          .eq('year', currentYear)
          .maybeSingle()

        // 2. Get leave type default
        const chosenType = leaveTypes.find(lt => lt.id === selectedLeaveTypeId)
        const defaultDays = Number(chosenType?.default_days || 0)

        // 3. Count currently approved or pending days this year
        const { data: takenRequests } = await supabase
          .from('leave_requests')
          .select('total_days, status')
          .eq('employee_id', staffIdentifier)
          .eq('leave_type_id', selectedLeaveTypeId)
          .in('status', ['Approved', 'Pending'])

        const approvedDays = (takenRequests || [])
          .filter(r => r.status === 'Approved')
          .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

        const pendingDays = (takenRequests || [])
          .filter(r => r.status === 'Pending')
          .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

        const entitled = balData ? Number(balData.entitled_days) : defaultDays
        const remaining = Math.max(0, entitled - approvedDays)

        setBalanceInfo({
          entitled,
          approvedDays,
          pendingDays,
          remaining
        })
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
      toast.error('Total leave days must be greater than zero.')
      return
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason or purpose for the leave.')
      return
    }

    const employeeObj = employees.find(e => e.id === selectedEmployeeId)
    if (!employeeObj) {
      toast.error('Selected employee details not found.')
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

      const { error } = await supabase
        .from('leave_requests')
        .insert(payload)

      if (error) throw error

      toast.success(`Leave application for ${employeeObj.full_name} submitted successfully! Awaiting supervisor review.`)
      navigate('/leave/requests')
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
                Representative portal: Submit formal time off request for departmental staff.
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          
          {/* SECTION 1: EMPLOYEE SELECTION */}
          <div>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
              <User size={18} className="text-[#006939]" />
              <h2 className="text-sm font-extrabold text-[#006939] uppercase tracking-wider">
                1. Select Colleague / Employee
              </h2>
            </div>

            {loadingData ? (
              <div className="p-6 bg-gray-50 rounded-xl flex items-center justify-center gap-2 text-gray-500 text-xs font-semibold">
                <Loader2 size={16} className="animate-spin text-[#006939]" />
                <span>Loading eligible department employees...</span>
              </div>
            ) : employees.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>No active employees found in your department. Contact administrator to onboard staff.</span>
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
                    <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                      <span>Staff ID: <strong>{selectedEmployee.staff_id || 'N/A'}</strong></span>
                      <span>•</span>
                      <span>Dept: <strong>{selectedEmployee.departments?.name || 'General'}</strong></span>
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
                  {leaveTypes.map(lt => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.default_days} days/year)
                    </option>
                  ))}
                </select>
                {selectedType?.description && (
                  <p className="text-[11px] text-gray-500 mt-1 italic">
                    {selectedType.description}
                  </p>
                )}
              </div>

              {/* Live Balance Card */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Annual Entitlement
                  </span>
                  {loadingBalance && <Loader2 size={12} className="animate-spin text-[#006939]" />}
                </div>

                {balanceInfo ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-white rounded-lg border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Entitled</p>
                      <p className="text-base font-black text-gray-800 mt-0.5">{balanceInfo.entitled}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Approved</p>
                      <p className="text-base font-black text-emerald-700 mt-0.5">{balanceInfo.approvedDays}</p>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-[10px] text-emerald-800 font-bold uppercase">Available</p>
                      <p className="text-base font-black text-[#006939] mt-0.5">{balanceInfo.remaining}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-3 italic">
                    Select an employee and leave category to preview annual balance.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: DATES & TOTAL DAYS */}
          <div>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
              <Clock size={18} className="text-[#006939]" />
              <h2 className="text-sm font-extrabold text-[#006939] uppercase tracking-wider">
                3. Leave Dates & Duration
              </h2>
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
                  Working Days *
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
                  Excludes weekends automatically.
                </p>
              </div>
            </div>

            {/* Warning if requested days exceeds available */}
            {balanceInfo && parseFloat(totalDays) > balanceInfo.remaining && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-xs">
                <AlertCircle size={16} className="shrink-0 text-amber-600" />
                <span>
                  Notice: Requested duration (<strong>{totalDays} days</strong>) exceeds available balance (<strong>{balanceInfo.remaining} days</strong>). Supervisor approval may require justification.
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
            <p className="text-xs text-gray-500 text-center sm:text-left">
              Submission sends this request to the department supervisor for review and decision.
            </p>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => navigate('/leave/requests')}
                disabled={submitting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Submit Leave Request</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  )
}

export default NewLeaveRequestPage

