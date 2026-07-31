import React, { useState, useEffect } from 'react'

// Bulletproof currency formatter — never throws even if value is null/undefined/NaN
const safeCurrency = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { logActivity } from '../utils/auditLogger'
import { useAuth } from '../context/AuthContext'
import { 
  ArrowLeft, 
  Save, 
  Clock, 
  DollarSign, 
  FileText,
  User,
  UserPlus,
  X,
  Calculator,
  Calendar,
  Loader2,
  CheckCircle2,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { isAdmin, isRep, isSupervisor } from '../utils/roleHelpers'

export const NewRecordPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Loading States
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [employees, setEmployees] = useState([])

  // Form Fields State
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([])
  const [employeeSearchText, setEmployeeSearchText] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [timeIn, setTimeIn] = useState('08:00')
  const [timeOut, setTimeOut] = useState('17:00')
  const [hourlyRate, setHourlyRate] = useState('')
  const [rateMultiplier, setRateMultiplier] = useState('1.5')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('Holiday')
  const [otherReason, setOtherReason] = useState('')

  // Quick Add Employee Modal State
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [departments, setDepartments] = useState([])
  const [qaFullName, setQaFullName] = useState('')
  const [qaStaffId, setQaStaffId] = useState('')
  const [qaCategory, setQaCategory] = useState('Shift')
  const [qaDepartmentId, setQaDepartmentId] = useState('')
  const [qaSaving, setQaSaving] = useState(false)

  // Computed Live Fields
  const [liveHours, setLiveHours] = useState(0)
  const [livePayout, setLivePayout] = useState(0)

  // Fetch active employees lists based on Role
  useEffect(() => {
    const fetchEmployees = async () => {
      if (!profile) return
      setLoadingEmployees(true)
      try {
        let query = supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            staff_id,
            category,
            department_id,
            company,
            hourly_rate,
            departments (
              name
            )
          `)
          .eq('is_active', true)
          .order('full_name')

        // Reps and Supervisors can only capture for colleagues in their own department
        if (isRep(profile) || isSupervisor(profile)) {
          query = query.eq('department_id', profile.department_id)
        }

        const { data, error } = await query
        if (error) throw error
        setEmployees(data || []);

        // Auto-select employees based on role
        if (isRep(profile)) {
          // For Rep, pre-select all employees in their department
          const ids = (data || []).map(emp => emp.id);
          setSelectedEmployeeIds(ids);
        } else {
          // Auto-select logged-in user for other roles if present
          const me = data?.find(emp => emp.id === profile.id);
          if (me) {
            setSelectedEmployeeIds([me.id]);
          }
        }
      } catch (err) {
        console.error("Error loading employees list:", err.message)
        toast.error("Failed to load employee list.")
      } finally {
        setLoadingEmployees(false)
      }
    }
    fetchEmployees()
    return fetchEmployees // expose for refresh
  }, [profile])

  // Fetch departments for quick-add modal
  useEffect(() => {
    supabase.from('departments').select('*').order('name').then(({ data }) => {
      setDepartments(data || [])
      if (data?.length > 0) setQaDepartmentId(data[0].id)
    })
  }, [])

  // Re-fetch employees and auto-select the newly added one
  const refreshAndSelect = async (newEmployeeId) => {
    try {
      let query = supabase
        .from('profiles')
        .select(`id, full_name, staff_id, category, department_id, company, hourly_rate, departments(name)`)
        .eq('is_active', true)
        .eq('role', 'employee')
        .order('full_name')
      if (isRep(profile)) {
        query = query.eq('department_id', profile.department_id)
      }
      const { data } = await query
      setEmployees(data || [])
      if (newEmployeeId) {
        setSelectedEmployeeIds(prev => [...new Set([...prev, newEmployeeId])])
      }
    } catch (err) {
      console.error('Refresh failed:', err.message)
    }
  }

  // Handle quick-add employee form submission
  const handleQuickAdd = async (e) => {
    e.preventDefault()
    if (!qaFullName.trim() || !qaStaffId.trim()) {
      toast.error('Please fill in all required fields.')
      return
    }
    setQaSaving(true)
    try {
        const newId = crypto.randomUUID();
        const dummyEmail = `temp-${newId}@cbi-overtime.local`;
        const { error } = await supabase.from('profiles').insert({
          id: newId,
          email: dummyEmail,
          full_name: qaFullName.trim(),
          staff_id: qaStaffId.trim(),
          category: qaCategory,
          role: 'employee',
          department_id: qaDepartmentId || profile.department_id,
          is_active: true
        });
      if (error) throw error

      toast.success(`${qaFullName} added and selected!`, { icon: <CheckCircle2 className="text-[#006939]" /> })
      setQuickAddOpen(false)
      // Reset modal fields
      setQaFullName(''); setQaStaffId('')
      setQaCategory('Shift')
      // Refresh list and auto-select new employee
      await refreshAndSelect(newId)
    } catch (err) {
      console.error('Quick add failed:', err.message)
      toast.error(err.message || 'Failed to add employee.')
    } finally {
      setQaSaving(false)
    }
  }

  // Live hours & payout calculator
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

    // Standard Overnight Shift logic (adds 24 hours if out < in)
    if (outMinutes < inMinutes) {
      outMinutes += 24 * 60
    }

    const elapsedMins = outMinutes - inMinutes
    const calculatedHours = Number((elapsedMins / 60).toFixed(2))
    
    setLiveHours(calculatedHours)

    let baseRate = Number(hourlyRate);
    if (!baseRate && selectedEmployeeIds.length > 0) {
      const firstEmp = employees.find(e => e.id === selectedEmployeeIds[0]);
      baseRate = Number(firstEmp?.hourly_rate) || 0;
    } else if (!baseRate) {
      baseRate = 0;
    }

    const mult = Number(rateMultiplier) || 0
    const payout = calculatedHours * baseRate * mult
    setLivePayout(Number(payout.toFixed(2)))
  }, [timeIn, timeOut, hourlyRate, rateMultiplier, selectedEmployeeIds, employees])

  // Adjust rate multiplier and reason options dynamically based on selected employees' company & category
  useEffect(() => {
    if (selectedEmployeeIds.length === 0) return

    const selectedEmps = employees.filter(emp => selectedEmployeeIds.includes(emp.id))
    const hasCBI = selectedEmps.some(emp => emp.company?.toUpperCase() === 'CBI')
    const hasAbanach = selectedEmps.some(emp => emp.company?.toUpperCase() === 'ABANACH')
    const hasShift = selectedEmps.some(emp => emp.category === 'Shift')
    const hasStraightDay = selectedEmps.some(emp => emp.category === 'Straight Day')

    // Handle Rate Multiplier adjustment
    if (hasCBI && !hasAbanach) {
      if (rateMultiplier !== '1.5' && rateMultiplier !== '2.0') {
        setRateMultiplier('1.5')
      }
    } else if (hasAbanach && !hasCBI) {
      if (rateMultiplier !== '1.0' && rateMultiplier !== '1.5') {
        setRateMultiplier('1.5')
      }
    } else if (hasCBI && hasAbanach) {
      if (rateMultiplier !== '1.5') {
        setRateMultiplier('1.5')
      }
    }

    // Handle Reason adjustment
    if (reason) {
      const isShiftReason = reason.includes('(Shift Only)')
      const isStraightDayReason = reason.includes('(Straight Day Only)')

      if (isShiftReason && !hasShift) {
        setReason('')
      } else if (isStraightDayReason && !hasStraightDay) {
        setReason('')
      }
    }
  }, [selectedEmployeeIds, employees, rateMultiplier, reason])

  // Filter employees based on search text
  const filteredEmployees = employees.filter(emp => {
    const search = employeeSearchText.toLowerCase().trim()
    if (!search) return true
    
    const nameMatch = emp.full_name?.toLowerCase().includes(search)
    const staffIdMatch = emp.staff_id?.toLowerCase().includes(search)
    const deptMatch = emp.departments?.name?.toLowerCase().includes(search)
    const catMatch = emp.category?.toLowerCase().includes(search)
    
    return nameMatch || staffIdMatch || deptMatch || catMatch
  })

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (selectedEmployeeIds.length === 0) {
      toast.error("Please select at least one employee.")
      return
    }

    const targetDateTime = new Date(`${date}T${timeIn}:00`).toISOString()
    const { data: blockedWindows, error: blockLookupError } = await supabase
      .from('admin_entry_blocks')
      .select('id, reason, company, department_id')
      .lte('start_at', targetDateTime)
      .gte('end_at', targetDateTime)

    if (blockLookupError) {
      console.error('Block lookup failed:', blockLookupError.message)
      toast.error('Unable to verify entry restrictions right now.')
      return
    }

    if (blockedWindows?.length > 0) {
      // Check if any selected employee falls into a block
      for (const block of blockedWindows) {
        const affectedEmployees = employees.filter(emp => selectedEmployeeIds.includes(emp.id)).filter(emp => {
          const companyMatch = !block.company || block.company === emp.company
          const deptMatch = !block.department_id || block.department_id === emp.department_id
          return companyMatch && deptMatch
        })
        
        if (affectedEmployees.length > 0) {
          toast.error(`Entry blocked for some selected employees: ${block.reason}`)
          return
        }
      }
    }
    if (liveHours <= 0) {
      toast.error("Invalid overtime duration: Hours must be greater than zero.")
      return
    }
    if (reason === 'Others' && !description.trim()) {
      toast.error("Please provide a task description when 'Others' is selected.")
      return
    }
    if (reason === 'Others' && !otherReason.trim()) {
      toast.error("Please specify your reason for overtime.")
      return
    }

    setSubmitting(true)
    try {
      const rows = await Promise.all(selectedEmployeeIds.map(async empId => {
        const selectedEmployee = employees.find(emp => emp.id === empId);
        let empRate = hourlyRate ? Number(hourlyRate) : (Number(selectedEmployee.hourly_rate) || 0);
        
        // Robust fallback: if profile has no rate yet, lookup their last used rate
        if (empRate === 0) {
          const empIdToMatch = selectedEmployee.staff_id || empId;
          const { data: pastRecord } = await supabase
            .from('overtime_records')
            .select('hourly_rate')
            .eq('employee_id', empIdToMatch)
            .gt('hourly_rate', 0)
            .order('captured_at', { ascending: false })
            .limit(1)
            .single();
            
          if (pastRecord) {
            empRate = Number(pastRecord.hourly_rate);
          }
        }

        // Guarantee accurate hours calculation synchronously
        const [inH, inM] = timeIn.split(':').map(Number);
        const [outH, outM] = timeOut.split(':').map(Number);
        let inMins = inH * 60 + inM;
        let outMins = outH * 60 + outM;
        if (outMins < inMins) outMins += 24 * 60;
        const calcHours = Number(((outMins - inMins) / 60).toFixed(2));

        const empPayout = Number((calcHours * empRate * Number(rateMultiplier)).toFixed(2));
        
        return {
          employee_name: selectedEmployee.full_name,
          employee_id: selectedEmployee.staff_id || empId,
          department_id: selectedEmployee.department_id,
          shift_type: selectedEmployee.category || 'Shift',
          work_date: date,
          time_in: timeIn,
          time_out: timeOut,
          hourly_rate: empRate,
          rate_multiplier: Number(rateMultiplier),
          estimated_payout: empPayout,
          description: description.trim(),
          reason: reason === 'Others' ? otherReason.trim() : reason,
          captured_by: profile.id,
          status: 'Pending'
        };
      }))

      const { error } = await supabase
        .from('overtime_records')
        .insert(rows)

      if (error) throw error

      if (isAdmin(profile) && hourlyRate !== '') {
        // Admin explicitly set a rate, so make it the new default for selected employees
        if (selectedEmployeeIds.length > 0) {
          const { error: rateErr } = await supabase
            .from('profiles')
            .update({ hourly_rate: Number(hourlyRate) })
            .in('id', selectedEmployeeIds)
          if (rateErr) console.error("Rate default update failed:", rateErr.message)
        }
      }

      await logActivity('Created Overtime Entry', { selectedEmployeeIds, date, description, reason });
        toast.success(`Overtime captured successfully for ${selectedEmployeeIds.length} employee(s)!`);
      navigate('/records')
    } catch (err) {
      console.error("Capture submit failed:", err.message)
      toast.error(err.message || "Failed to capture overtime record.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/records')}
          className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Capture Overtime Entry
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Log a new overtime session for supervisor review.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Capture Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]"></div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Section 1: Searchable Checkbox Grid of Employees */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider flex items-center gap-1.5">
                <User size={14} />
                <span>Select Employees ({selectedEmployeeIds.length} Selected)</span>
              </label>
              
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const filteredIds = filteredEmployees.map(emp => emp.id)
                    setSelectedEmployeeIds(prev => {
                      const merged = new Set([...prev, ...filteredIds])
                      return Array.from(merged)
                    })
                  }}
                  className="text-xs font-bold text-[#006939] hover:underline"
                >
                  Select Filtered
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeIds([])}
                  className="text-xs font-bold text-red-600 hover:underline"
                >
                  Clear All
                </button>
                <span className="text-gray-300">|</span>
                {/* Quick Add Employee shortcut */}
                {isAdmin(profile) && (
                  <button
                    type="button"
                    onClick={() => setQuickAddOpen(true)}
                    className="flex items-center gap-1 text-xs font-bold text-[#FDB913] bg-[#004D2A] hover:bg-[#006939] px-2.5 py-1 rounded-md transition-colors"
                  >
                    <UserPlus size={12} />
                    <span>Add New Employee</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative rounded-lg shadow-sm">
              <input
                type="text"
                placeholder="Search employees by name, staff ID, department, or category..."
                value={employeeSearchText}
                onChange={(e) => setEmployeeSearchText(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
              />
            </div>

            {/* Scrollable grid box for employees list */}
            <div className="border border-gray-150 rounded-xl bg-gray-50 p-4 max-h-[220px] overflow-y-auto">
              {loadingEmployees ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 bg-white rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : filteredEmployees.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredEmployees.map(emp => {
                    const isSelected = selectedEmployeeIds.includes(emp.id)
                    return (
                      <label
                        key={emp.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-[#E8F5EE] border-[#006939] shadow-sm shadow-[#006939]/5' 
                            : 'bg-white border-gray-150 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedEmployeeIds(prev => prev.filter(id => id !== emp.id))
                            } else {
                              setSelectedEmployeeIds(prev => [...prev, emp.id])
                            }
                          }}
                          className="w-4 h-4 text-[#006939] border-gray-300 rounded focus:ring-[#006939]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="text-xs font-bold text-gray-800 truncate">
                              {emp.full_name} {emp.id === profile?.id ? '(Me)' : ''}
                            </p>
                            <span className="text-[10px] font-bold text-[#006939] bg-[#E8F5EE] px-1.5 py-0.5 rounded">
                              {emp.staff_id || 'N/A'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-500 mt-0.5">
                            <span className="truncate">{emp.departments?.name}</span>
                            <span className="font-semibold text-gray-700 bg-gray-100 px-1 rounded">
                              {emp.category || 'Shift'}
                            </span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400 text-xs">
                  No employees found matching "{employeeSearchText}"
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Shift Date and Times */}
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
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer"
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
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer"
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
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Section 3: Financial Calculations */}
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
                  required={false}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all"
                  placeholder={
                    selectedEmployeeIds.length === 1
                      ? `Default: ${employees.find(e => e.id === selectedEmployeeIds[0])?.hourly_rate || '0'}`
                      : "Leave empty for defaults"
                  }
                  disabled={submitting}
                />
                {selectedEmployeeIds.length > 0 && hourlyRate === '' && (
                  <p className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1 font-semibold">
                    <CheckCircle2 size={12} className="text-[#006939]" />
                    Using {selectedEmployeeIds.length === 1 ? `default rate: GHS ${employees.find(e => e.id === selectedEmployeeIds[0])?.hourly_rate || '0.00'}` : 'individual employee default rates'}
                  </p>
                )}
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
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer"
                disabled={submitting}
              >
                {(() => {
                  const selectedEmps = employees.filter(emp => selectedEmployeeIds.includes(emp.id))
                  const hasCBI = selectedEmps.some(emp => emp.company?.toUpperCase() === 'CBI')
                  const hasAbanach = selectedEmps.some(emp => emp.company?.toUpperCase() === 'ABANACH')

                  const show1_0 = !hasCBI
                  const show1_5 = true
                  const show2_0 = !hasAbanach

                  return (
                    <>
                      {show1_0 && <option value="1.0">1.0x (Straight Time)</option>}
                      {show1_5 && <option value="1.5">1.5x (Standard Overtime)</option>}
                      {show2_0 && <option value="2.0">2.0x (Sunday / Public Holiday)</option>}
                    </>
                  )
                })()}
              </select>
            </div>
          </div>

          {/* Section 4: Live Hours & Payout Summary Panel (High Premium Visual) */}
          <div className="bg-gradient-to-r from-[#004D2A] to-[#006939] rounded-2xl p-6 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 shadow-md shadow-[#004D2A]/10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/10 rounded-xl">
                <Calculator size={24} className="text-[#FDB913]" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-white/60 font-bold">Live Calculator</p>
                <p className="text-xs text-white/80 mt-0.5">
                  {timeIn} to {timeOut} {Number(timeOut.replace(':', '')) < Number(timeIn.replace(':', '')) ? '(Overnight Shift)' : ''}
                </p>
              </div>
            </div>

            <div className="flex gap-8 sm:gap-12 flex-wrap sm:flex-nowrap">
              <div>
                <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Overtime Hours</p>
                <p className="text-3xl font-[900] text-[#FDB913] mt-1">{liveHours} <span className="text-xs text-white font-bold">HRS</span></p>
              </div>
              {isAdmin(profile) && (
                <>
                  <div className="border-l border-white/20 pl-6 sm:pl-8">
                    <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Payout / Employee</p>
                    <p className="text-3xl font-[900] text-[#FDB913] mt-1">
                      GHS {safeCurrency(livePayout)}
                    </p>
                  </div>
                  <div className="border-l border-white/20 pl-6 sm:pl-8">
                    <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Total Bulk Cost</p>
                    <p className="text-3xl font-[900] text-[#FDB913] mt-1">
                      GHS {safeCurrency(livePayout * selectedEmployeeIds.length)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>


{/* Task Description */}
<div className="mt-6">
  <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
    <FileText size={14} />
    Task Description
    {reason === 'Others' && <span className="text-red-500">*</span>}
  </label>
  <textarea
    required={reason === 'Others'}
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    className="block w-full px-3.5 py-3 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all resize-none"
    placeholder="Briefly describe the task or work done during overtime..."
    rows={3}
    disabled={submitting}
  />
</div>

{/* Reason for Overtime */}
<div className="mt-4">
  <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
    <FileText size={14} />
    Reason
    <span className="text-red-500">*</span>
  </label>
  <select
    value={reason}
    onChange={e => setReason(e.target.value)}
    className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all cursor-pointer"
    disabled={submitting}
  >
    {(() => {
      const selectedEmps = employees.filter(emp => selectedEmployeeIds.includes(emp.id))
      const hasShift = selectedEmps.some(emp => emp.category === 'Shift')
      const hasStraightDay = selectedEmps.some(emp => emp.category === 'Straight Day')

      const showShiftOptions = !selectedEmployeeIds.length || hasShift
      const showStraightDayOptions = !selectedEmployeeIds.length || hasStraightDay

      return (
        <>
          <option value="">Select a Reason</option>
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
</div>
{reason === 'Others' && (
  <div className="mt-4">
    <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
      <FileText size={14} />
      Please specify the reason
      <span className="text-red-500">*</span>
    </label>
    <input
      type="text"
      value={otherReason}
      onChange={e => setOtherReason(e.target.value)}
      className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
      placeholder="Enter reason for overtime..."
      disabled={submitting}
    />
  </div>
)}
        </div>

        {/* Action Panel Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3.5">
          <button
            type="button"
            onClick={() => navigate('/records')}
            className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors w-full sm:w-auto"
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
                <span>Saving entry...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save Overtime Entry</span>
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
                If a shift worker is assigned to work extended hours (regardless of the reason) on their regular scheduled shift, these hours are classified as <strong className="text-gray-800">"Replacement - Extended Hours."</strong> The rate is 1.5x for CBI and 1.0x for Abanach.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Off Day Work:</p>
              <p className="mt-1 leading-relaxed text-gray-500">
                If a shift worker is assigned to work on a scheduled day off (regardless of the reason), these hours are classified as <strong className="text-gray-800">"Replacement - Day Off Hours."</strong> The rate is 2.0x for CBI and 1.5x for Abanach.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* -------------------------------------------------------
          QUICK ADD EMPLOYEE MODAL
          ------------------------------------------------------- */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
          {/* Backdrop */}
          <div onClick={() => setQuickAddOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal Card */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-10 animate-scale-up">
            {/* Header */}
            <div className="bg-[#006939] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-[#FDB913]" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Quick Add Employee</h3>
              </div>
              <button onClick={() => setQuickAddOpen(false)} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleQuickAdd} className="p-6 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Add a missing employee to the system. They will be <strong>automatically selected</strong> for this overtime entry once saved.
              </p>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input type="text" required value={qaFullName} onChange={e => setQaFullName(e.target.value)}
                  placeholder="e.g. James Forson"
                  className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
                  disabled={qaSaving} />
              </div>

              {/* Staff ID & Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1.5">Staff ID <span className="text-red-500">*</span></label>
                  <input type="text" required value={qaStaffId} onChange={e => setQaStaffId(e.target.value)}
                    placeholder="e.g. CBI-011"
                    className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
                    disabled={qaSaving} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1.5">Category</label>
                  <select value={qaCategory} onChange={e => setQaCategory(e.target.value)}
                    className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all cursor-pointer"
                    disabled={qaSaving}>
                    <option value="Shift">Shift</option>
                    <option value="Straight Day">Straight Day</option>
                  </select>
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1.5">Department</label>
                <select value={qaDepartmentId} onChange={e => setQaDepartmentId(e.target.value)}
                  className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all cursor-pointer"
                  disabled={qaSaving}>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* Footer Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setQuickAddOpen(false)} disabled={qaSaving}
                  className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={qaSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50">
                  {qaSaving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                  <span>{qaSaving ? 'Saving...' : 'Add & Select'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewRecordPage
