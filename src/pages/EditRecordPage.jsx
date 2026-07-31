import React, { useState, useEffect } from 'react'

// Bulletproof currency formatter — never throws even if value is null/undefined/NaN
const safeCurrency = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { 
  ArrowLeft, 
  Save, 
  Clock, 
  DollarSign, 
  FileText,
  User,
  Calculator,
  Calendar,
  Loader2,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { canEditRecord, isAdmin } from '../utils/roleHelpers'

export const EditRecordPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  // Loading States
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [recordOwnerName, setRecordOwnerName] = useState('')
  const [recordOwnerDept, setRecordOwnerDept] = useState('')
  const [recordEmployeeId, setRecordEmployeeId] = useState('')

  // Form Fields State
  const [date, setDate] = useState('')
  const [timeIn, setTimeIn] = useState('')
  const [timeOut, setTimeOut] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [originalHourlyRate, setOriginalHourlyRate] = useState('')
  const [recordDate, setRecordDate] = useState('')
  const [rateMultiplier, setRateMultiplier] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('Holiday')
  const [otherReason, setOtherReason] = useState('')
  const [employeeCompany, setEmployeeCompany] = useState('')
  const [employeeCategory, setEmployeeCategory] = useState('Shift')

  // Computed Live Fields
  const [liveHours, setLiveHours] = useState(0)
  const [livePayout, setLivePayout] = useState(0)

  // Fetch target record detail
  useEffect(() => {
    const fetchRecord = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('overtime_records')
          .select(`
            *,
            departments (
              name
            )
          `)
          .eq('id', id)
          .single()

        if (error) throw error

        // Run RBAC safety check
        if (!canEditRecord(profile, data)) {
          toast.error("Unauthorized: You do not have permission to edit this record (it may have been reviewed or belongs elsewhere).")
          navigate('/records')
          return
        }

        // Prepopulate form state
        setRecordOwnerName(data.employee_name || 'N/A')
        setRecordOwnerDept(data.departments?.name || 'N/A')
        setRecordEmployeeId(data.employee_id || '')
        setDate(data.work_date || '')
        setRecordDate(data.work_date || '')
        setTimeIn(data.time_in?.slice(0, 5) || '') // Format to HH:MM
        setTimeOut(data.time_out?.slice(0, 5) || '')
        setHourlyRate(String(data.hourly_rate))
        setOriginalHourlyRate(String(data.hourly_rate))
        setRateMultiplier(String(data.rate_multiplier))
        setDescription(data.description);
        // Populate reason and otherReason based on stored value
        const predefined = [
          'Holiday',
          'Replacement - Extended Hours (Shift Only)',
          'Replacement - Day_Off (Shift Only)',
          'Normal Routine Schedule (Straight Day Only)',
          'PM',
          'Weekend (Straight Day Only)'
        ];
        if (predefined.includes(data.reason)) {
          setReason(data.reason);
          setOtherReason('');
        } else {
          setReason('Others');
          setOtherReason(data.reason || '');
        }

        // Fetch company and category from profiles table
        if (data.employee_id) {
          supabase
            .from('profiles')
            .select('company, category')
            .ilike('staff_id', data.employee_id)
            .maybeSingle()
            .then(({ data: empProfile, error: empErr }) => {
              if (!empErr && empProfile) {
                setEmployeeCompany(empProfile.company || '')
                setEmployeeCategory(empProfile.category || data.shift_type || 'Shift')
              } else {
                supabase
                  .from('profiles')
                  .select('company, category')
                  .eq('id', data.employee_id)
                  .maybeSingle()
                  .then(({ data: empProfile2, error: empErr2 }) => {
                    if (!empErr2 && empProfile2) {
                      setEmployeeCompany(empProfile2.company || '')
                      setEmployeeCategory(empProfile2.category || data.shift_type || 'Shift')
                    } else {
                      setEmployeeCategory(data.shift_type || 'Shift')
                    }
                  })
              }
            })
        } else {
          setEmployeeCategory(data.shift_type || 'Shift')
        }
      } catch (err) {
        console.error("Load edit record failed:", err.message)
        toast.error("Failed to load overtime record data.")
        navigate('/records')
      } finally {
        setLoading(false)
      }
    }
    if (profile) {
      fetchRecord()
    }
  }, [id, profile])

  // Live calculator hook
  useEffect(() => {
    if (!timeIn || !timeOut) {
      setLiveHours(0)
      setLivePayout(0)
      return
    }

    const [inHours, inMins] = timeIn.split(':').map(Number)
    const [outHours, outMins] = timeOut.split(':').map(Number)

    let inMinutes = inHours * 60 + inMins
    let outMinutes = outHours * 60 + outMins

    // Standard Overnight Shift logic
    if (outMinutes < inMinutes) {
      outMinutes += 24 * 60
    }

    const elapsedMins = outMinutes - inMinutes
    const calculatedHours = Number((elapsedMins / 60).toFixed(2))
    
    setLiveHours(calculatedHours)

    const rate = Number(hourlyRate) || 0
    const mult = Number(rateMultiplier) || 0
    const payout = calculatedHours * rate * mult
    setLivePayout(Number(payout.toFixed(2)))
  }, [timeIn, timeOut, hourlyRate, rateMultiplier])

  // Adjust rate multiplier and reason options if they violate the company/category rules
  useEffect(() => {
    if (!employeeCompany && !employeeCategory) return

    const isCBI = employeeCompany?.toUpperCase() === 'CBI'
    const isAbanach = employeeCompany?.toUpperCase() === 'ABANACH'

    if (isCBI) {
      if (rateMultiplier !== '1.5' && rateMultiplier !== '2') {
        setRateMultiplier('1.5')
      }
    } else if (isAbanach) {
      if (rateMultiplier !== '1' && rateMultiplier !== '1.5') {
        setRateMultiplier('1.5')
      }
    }

    if (reason) {
      const isShiftReason = reason.includes('(Shift Only)')
      const isStraightDayReason = reason.includes('(Straight Day Only)')

      if (isShiftReason && employeeCategory !== 'Shift') {
        setReason('Holiday')
      } else if (isStraightDayReason && employeeCategory !== 'Straight Day') {
        setReason('Holiday')
      }
    }
  }, [employeeCompany, employeeCategory, rateMultiplier, reason])

  // Handle Form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (liveHours <= 0) {
      toast.error("Invalid overtime duration: Hours must be greater than zero.")
      return
    }
    if (!description.trim()) {
      toast.error("Please provide a task description.")
      return
    }
    // Validate custom reason when 'Others' selected
    if (reason === 'Others' && !otherReason.trim()) {
      toast.error("Please specify your reason for overtime.")
      return
    }

    setSubmitting(true)
    try {
      const selectedDate = new Date(`${date}T${timeIn}:00`)
      const targetTime = selectedDate.toISOString()
      const { data: blockedWindows, error: blockLookupError } = await supabase
        .from('admin_entry_blocks')
        .select('id, reason, company, department_id')
        .lte('start_at', targetTime)
        .gte('end_at', targetTime)

      if (blockLookupError) throw blockLookupError

      if (blockedWindows?.length > 0) {
        // Fetch the target employee's company to check scope
        const { data: empData } = await supabase.from('profiles').select('id, company, department_id').eq('staff_id', recordEmployeeId).single()
        
        for (const block of blockedWindows) {
          const companyMatch = !block.company || block.company === empData?.company
          const deptMatch = !block.department_id || block.department_id === empData?.department_id
          if (companyMatch && deptMatch) {
            toast.error(`Entry submission is blocked for this time window: ${block.reason}`)
            return
          }
        }
      }

      const currentDate = recordDate || date
      const nextRate = Number(hourlyRate)
      const { error } = await supabase
        .from('overtime_records')
        .update({
          work_date: date,
          time_in: timeIn,
          time_out: timeOut,
          hourly_rate: Number(hourlyRate),
          rate_multiplier: Number(rateMultiplier),
          estimated_payout: livePayout,
          reason: reason === 'Others' ? otherReason.trim() : reason,
          description: description.trim()
        })
        .eq('id', id)

      // Update the employee's stored hourly rate to become the new default going forward
      if (isAdmin(profile) && hourlyRate !== originalHourlyRate && hourlyRate !== '' && recordEmployeeId) {
        const { error: employeeError } = await supabase
          .from('profiles')
          .update({ hourly_rate: nextRate })
          .eq('staff_id', recordEmployeeId)

        if (employeeError) throw employeeError
      }

      if (error) throw error

      toast.success("Overtime record updated successfully! Changes take effect immediately.")
      navigate(`/records/${id}`)
    } catch (err) {
      console.error("Update failed:", err.message)
      toast.error(err.message || "Failed to update record details.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#006939]"></div>
          <p className="text-xs text-gray-500 font-sans font-semibold">Loading record configurations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      {/* Back navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/records/${id}`)}
          className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Modify Overtime Log
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Edit shift hours, rates, or work logs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Editing Form panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]"></div>

        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Read only info block: Employee & Dept */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400">Employee Name</span>
              <span className="text-sm font-bold text-gray-700">{recordOwnerName}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-400">Department</span>
              <span className="text-sm font-bold text-[#006939]">{recordOwnerDept}</span>
            </div>
          </div>

          {/* Section 1: Dates & Times */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar size={14} />
                <span>Shift Date</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock size={14} />
                <span>Time In</span>
              </label>
              <input
                type="time"
                required
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock size={14} />
                <span>Time Out</span>
              </label>
              <input
                type="time"
                required
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Section 2: Finances */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#006939]/5 border border-[#006939]/10 rounded-2xl p-5">
            {isAdmin(profile) ? (
              <div>
                <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <DollarSign size={14} />
                  <span>Hourly Rate (GHS)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all font-medium"
                  placeholder="0.00"
                  disabled={submitting}
                />
              </div>
            ) : (
              <div className="hidden md:block"></div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2">
                Rate Multiplier
              </label>
              <select
                required
                value={rateMultiplier}
                onChange={(e) => setRateMultiplier(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                disabled={submitting}
              >
                {(() => {
                  const isCBI = employeeCompany?.toUpperCase() === 'CBI'
                  const isAbanach = employeeCompany?.toUpperCase() === 'ABANACH'

                  const show1_0 = !isCBI
                  const show1_5 = true
                  const show2_0 = !isAbanach

                  return (
                    <>
                      {show1_0 && <option value="1">1.0x (Straight Time)</option>}
                      {show1_5 && <option value="1.5">1.5x (Standard Overtime)</option>}
                      {show2_0 && <option value="2">2.0x (Sunday / Public Holiday)</option>}
                    </>
                  )
                })()}
              </select>
            </div>
          </div>

          {/* Section 3: Live Payout panel */}
          <div className="bg-gradient-to-r from-[#004D2A] to-[#006939] rounded-2xl p-6 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 shadow-md shadow-[#004D2A]/10 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/10 rounded-xl">
                <Calculator size={24} className="text-[#FDB913]" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-white/60 font-bold">New Calculations</p>
                <p className="text-xs text-white/80 mt-0.5">
                  {timeIn} to {timeOut} {Number(timeOut.replace(':', '')) < Number(timeIn.replace(':', '')) ? '(Overnight Shift)' : ''}
                </p>
              </div>
            </div>

            <div className="flex gap-8 sm:gap-12">
              <div>
                <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Overtime Hours</p>
                <p className="text-3xl font-[900] text-[#FDB913] mt-1">{liveHours} <span className="text-xs text-white font-bold">HRS</span></p>
              </div>
              {isAdmin(profile) && (
                <div className="border-l border-white/20 pl-6 sm:pl-8">
                  <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Est. Payout</p>
                  <p className="text-3xl font-[900] text-[#FDB913] mt-1">
                    GHS {safeCurrency(livePayout)}
                  </p>
                </div>
              )}
            </div>
          </div>

            {/* Section 4: Overtime Reason */}
            <div className="mt-4">
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={14} />
                <span>Reason for Overtime</span>
              </label>
              <select
                value={reason}
                onChange={(e) => {
                  const val = e.target.value;
                  setReason(val);
                  if (val !== 'Others') setOtherReason('');
                }}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all"
                disabled={submitting}
              >
                {(() => {
                  const showShiftOptions = employeeCategory === 'Shift'
                  const showStraightDayOptions = employeeCategory === 'Straight Day'

                  return (
                    <>
                      <option value="Holiday">Holiday</option>
                      {showShiftOptions && (
                        <>
                          <option value="Replacement - Extended Hours (Shift Only)">Replacement - Extended Hours (Shift Only)</option>
                          <option value="Replacement - Day_Off (Shift Only)">Replacement - Day_Off (Shift Only)</option>
                        </>
                      )}
                      {showStraightDayOptions && (
                        <option value="Normal Routine Schedule (Straight Day Only)">Normal Routine Schedule (Straight Day Only)</option>
                      )}
                      <option value="PM">PM</option>
                      {showStraightDayOptions && (
                        <option value="Weekend (Straight Day Only)">Weekend (Straight Day Only)</option>
                      )}
                      <option value="Others">Others</option>
                    </>
                  )
                })()}
              </select>
              {reason === 'Others' && (
                <input
                  type="text"
                  placeholder="Specify reason..."
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  className="mt-2 block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all"
                  disabled={submitting}
                />
              )}
            </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3.5">
          <button
            type="button"
            onClick={() => navigate(`/records/${id}`)}
            className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors w-full sm:w-auto font-sans"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] w-full sm:w-auto disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving updates...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save Record Details</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Policy and Guidelines Sidebar Panel */}
      <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden p-6 space-y-6 lg:sticky lg:top-6">
        <h3 className="text-sm font-[900] text-[#006939] uppercase tracking-wider border-b border-gray-150 pb-3 flex items-center gap-2">
          <Info className="h-5 w-5 text-[#FDB913]" />
          <span>Overtime Policy & Guidelines</span>
        </h3>

        {/* A. Overtime Rate Multipliers */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 font-sans">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#006939]/10 text-[#006939] text-[10px] font-bold">A</span>
            Overtime Rate Multipliers
          </h4>
          
          <div className="pl-6 space-y-3 text-xs text-gray-600 font-sans">
            <div>
              <p className="font-semibold text-gray-700">Standard Rates:</p>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>
                  <strong className="text-[#006939]">CBI:</strong> 1.5x for Monday–Friday; 2.0x for Weekends and Holidays.
                </li>
                <li>
                  <strong className="text-[#006939]">Abanach:</strong> 1.0x for Monday–Friday; 1.5x for Weekends and Holidays.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-gray-700">Shift Worker Application:</p>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>Overtime hours worked during a normal scheduled shift follow the standard weekday rates (1.5x for CBI / 1.0x for Abanach).</li>
                <li>Overtime hours worked on a scheduled Day Off or Holiday follow the weekend/holiday rates (2.0x for CBI / 1.5x for Abanach).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* B. Break Deductions */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 font-sans">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#006939]/10 text-[#006939] text-[10px] font-bold">B</span>
            Break Deductions for Shift Workers
          </h4>
          <div className="pl-6 space-y-2 text-xs text-gray-600 font-sans">
            <div className="flex gap-2 items-start bg-gray-50 p-2.5 rounded-lg border border-gray-150">
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px] uppercase shrink-0 mt-0.5">8h - 16h</span>
              <p className="leading-relaxed">For total work hours exceeding 8 hours, but less than or equal to 16 hours, a 30-minute break deduction applies.</p>
            </div>
            <div className="flex gap-2 items-start bg-gray-50 p-2.5 rounded-lg border border-gray-150">
              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[9px] uppercase shrink-0 mt-0.5">≥ 16h</span>
              <p className="leading-relaxed">For total work hours equal to or exceeding 16 hours, a 1-hour break deduction applies.</p>
            </div>
          </div>
        </div>

        {/* C. Special Shift Overtime */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5 font-sans">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#006939]/10 text-[#006939] text-[10px] font-bold">C</span>
            Special Shift Worker Overtime
          </h4>
          <div className="pl-6 space-y-3 text-xs text-gray-600 font-sans">
            <div>
              <p className="font-semibold text-gray-700">Extended Hours (Normal Scheduled Shift):</p>
              <p className="mt-1 leading-relaxed text-gray-500">
                If a shift worker is assigned to work extended hours (regardless of the reason) on their regular scheduled shift, these hours are classified as <strong className="text-gray-800 font-sans">"Replacement - Extended Hours."</strong> The rate is 1.5x for CBI and 1.0x for Abanach.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Off Day Work:</p>
              <p className="mt-1 leading-relaxed text-gray-500">
                If a shift worker is assigned to work on a scheduled day off (regardless of the reason), these hours are classified as <strong className="text-gray-800 font-sans">"Replacement - Day Off Hours."</strong> The rate is 2.0x for CBI and 1.5x for Abanach.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

export default EditRecordPage
