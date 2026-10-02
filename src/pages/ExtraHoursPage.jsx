import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import {
  Clock4,
  Search,
  Loader2,
  FolderOpen,
  DollarSign,
  Users,
  CheckCircle2,
  History,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ExtraHoursHistoryModal } from '../components/ExtraHoursHistoryModal'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const currentYear  = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1   // 1-based

const formatCurrency = (v) => {
  if (v == null) return 'GHS 0.00'
  return `GHS ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const ExtraHoursPage = () => {
  const { profile } = useAuth()

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3">
        <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
        <p>The Extra Hours tab is only visible to Admin Users.</p>
      </div>
    )
  }

  const [searchText, setSearchText] = useState('')
  const [shiftEmployees, setShiftEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  // Local inputs state: { [profileId]: { hours, notes } }
  const [edits, setEdits] = useState({})
  const [processing, setProcessing] = useState(false)

  // History modal
  const [showHistory, setShowHistory] = useState(false)

  // Fetch shift employees
  const fetchShiftEmployees = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, full_name, staff_id, hourly_rate, is_active,
          department_id,
          departments(name)
        `)
        .eq('category', 'Shift')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      setShiftEmployees(data || [])
    } catch (err) {
      console.error('Failed to load shift employees:', err.message)
      toast.error('Failed to load Shift employees.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchShiftEmployees()
  }, [fetchShiftEmployees])

  const getEditValue = (profileId, field, fallback = '') => {
    if (edits[profileId] && edits[profileId][field] !== undefined) return edits[profileId][field]
    return fallback
  }

  const setEditField = (profileId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [profileId]: { ...(prev[profileId] || {}), [field]: value }
    }))
  }

  // Calculate summaries based on current inputs
  const summary = shiftEmployees.reduce((acc, emp) => {
    const hours = parseFloat(getEditValue(emp.id, 'hours_assigned', '0')) || 0
    if (hours > 0) {
      acc.totalEntries += 1
      acc.totalHours += hours
      acc.totalCost += hours * Number(emp.hourly_rate || 0)
    }
    return acc
  }, { totalEntries: 0, totalHours: 0, totalCost: 0 })

  const handleProcessAll = async () => {
    if (summary.totalEntries === 0) {
      toast.error('No hours assigned to process.')
      return
    }

    if (!window.confirm(`Are you sure you want to process ${summary.totalEntries} entries for ${MONTHS[currentMonth - 1]} ${currentYear}?`)) {
      return
    }

    setProcessing(true)
    try {
      const payloads = []
      
      shiftEmployees.forEach(emp => {
        const hours = parseFloat(getEditValue(emp.id, 'hours_assigned', '0')) || 0
        if (hours > 0) {
          payloads.push({
            profile_id:    emp.id,
            employee_name: emp.full_name,
            staff_id:      emp.staff_id || null,
            department_id: emp.department_id || null,
            entry_month:   currentMonth,
            entry_year:    currentYear,
            hours_assigned: hours,
            hourly_rate:    Number(emp.hourly_rate || 0),
            status:         'Approved',
            approved_by:    profile.id,
            approved_at:    new Date().toISOString(),
            created_by:     profile.id,
            notes:          getEditValue(emp.id, 'notes', '') || null,
          })
        }
      })

      if (payloads.length > 0) {
        const { error } = await supabase.from('extra_hours').insert(payloads)
        if (error) throw error
      }

      toast.success(`Successfully processed ${payloads.length} entries.`)
      // Reset all inputs
      setEdits({})
    } catch (err) {
      console.error('Processing extra hours failed:', err.message)
      toast.error('Failed to process extra hours.')
    } finally {
      setProcessing(false)
    }
  }

  const filteredEmployees = shiftEmployees.filter(emp => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.staff_id?.toLowerCase().includes(q) ||
      emp.departments?.name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6 font-sans">
      <ExtraHoursHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans flex items-center gap-2">
            <Clock4 size={20} className="text-[#006939]" />
            Extra Hours Assignment
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Assign hours for <span className="font-semibold text-[#0288D1]">Shift</span> employees. Click "Process" to save them to history and reset the sheet.
          </p>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm shadow-sm transition-all active:scale-[0.98] shrink-0"
        >
          <History size={15} />
          View History
        </button>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-28">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#0288D1]"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending Entries</p>
              <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-1 tracking-tight">{summary.totalEntries}</h3>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-xl text-[#0288D1] shrink-0"><Users size={18} /></div>
          </div>
          <p className="text-xs text-gray-400 pl-2">Employees with hours &gt; 0</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-28">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#006939]"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Hours</p>
              <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-1 tracking-tight">
                {summary.totalHours.toFixed(1)} <span className="text-xs font-bold text-gray-400">HRS</span>
              </h3>
            </div>
            <div className="p-2.5 bg-[#E8F5EE] rounded-xl text-[#006939] shrink-0"><Clock4 size={18} /></div>
          </div>
          <p className="text-xs text-gray-400 pl-2">Sum of pending hours.</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-28">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-emerald-600"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Cost</p>
              <h3 className="text-2xl font-[900] text-[#1A1A1A] mt-1 tracking-tight">
                {formatCurrency(summary.totalCost)}
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 shrink-0"><DollarSign size={18} /></div>
          </div>
          <p className="text-xs text-gray-400 pl-2">Pending hours × hourly rate.</p>
        </div>
      </div>

      {/* ── Controls: Search & Process ────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-end">
        <div className="flex-1 min-w-[200px] w-full">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Search Employee</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Name, Staff ID, or Department..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="block w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
            />
            {searchText && (
              <button onClick={() => setSearchText('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        
        {/* PROCESSED BUTTON - Made highly visible */}
        <button
          onClick={handleProcessAll}
          disabled={processing}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-[#FDB913] hover:bg-[#e5a711] text-[#004D2A] font-[900] text-base shadow-lg transition-all active:scale-[0.98] border-2 border-[#FDB913]"
        >
          {processing ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
          PROCESSED ({summary.totalEntries})
        </button>
      </div>

      {/* ── Employee Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-4 h-14 items-center border-b border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-8 bg-gray-200 rounded w-24"></div>
              </div>
            ))}
          </div>
        ) : filteredEmployees.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-4">Employee Name</th>
                  <th className="px-5 py-4">Staff ID</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-5 py-4">Hourly Rate</th>
                  <th className="px-5 py-4">Hours Assigned</th>
                  <th className="px-5 py-4">Est. Cost</th>
                  <th className="px-5 py-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredEmployees.map(emp => {
                  const hoursVal    = getEditValue(emp.id, 'hours_assigned', '')
                  const notesVal    = getEditValue(emp.id, 'notes', '')
                  const hourlyRate  = Number(emp.hourly_rate || 0)
                  const hoursNum    = parseFloat(hoursVal) || 0
                  const previewCost = hoursNum * hourlyRate
                  const isDirty     = hoursNum > 0

                  return (
                    <tr key={emp.id} className={`transition-colors ${isDirty ? 'bg-[#E8F5EE]/20 hover:bg-[#E8F5EE]/40' : 'hover:bg-gray-50/60'}`}>
                      {/* Name */}
                      <td className="px-5 py-3 font-semibold text-[#1A1A1A]">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#E1F5FE] flex items-center justify-center text-[#0288D1] font-bold text-xs shrink-0">
                            {emp.full_name?.charAt(0) || '?'}
                          </div>
                          <span className="truncate max-w-[160px]">{emp.full_name}</span>
                        </div>
                      </td>

                      {/* Staff ID */}
                      <td className="px-5 py-3 font-mono text-gray-600 text-xs">
                        {emp.staff_id || <span className="text-gray-400 italic">N/A</span>}
                      </td>

                      {/* Department */}
                      <td className="px-5 py-3 text-gray-600">
                        {emp.departments?.name || <span className="text-gray-400 italic">Unassigned</span>}
                      </td>

                      {/* Hourly Rate */}
                      <td className="px-5 py-3 text-gray-600 font-medium">
                        {hourlyRate > 0
                          ? <span className="font-semibold text-emerald-700">GHS {hourlyRate.toFixed(2)}</span>
                          : <span className="text-red-400 text-xs italic">No rate set</span>
                        }
                      </td>

                      {/* Hours input */}
                      <td className="px-5 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={hoursVal}
                          onChange={e => setEditField(emp.id, 'hours_assigned', e.target.value)}
                          placeholder="0"
                          className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#006939] bg-gray-50 focus:bg-white transition-all"
                        />
                      </td>

                      {/* Estimated cost */}
                      <td className="px-5 py-3 font-semibold">
                        {previewCost > 0 ? (
                          <span className="text-emerald-700">{formatCurrency(previewCost)}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={notesVal}
                          onChange={e => setEditField(emp.id, 'notes', e.target.value)}
                          placeholder="Optional..."
                          className="w-full min-w-[150px] px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939] bg-gray-50 focus:bg-white transition-all placeholder-gray-400"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3">
            <FolderOpen size={48} className="text-gray-300" />
            <p className="text-sm font-semibold">No Shift employees found.</p>
          </div>
        )}
      </div>

    </div>
  )
}

export default ExtraHoursPage
