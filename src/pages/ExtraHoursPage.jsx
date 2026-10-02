import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import {
  Clock4,
  Search,
  Download,
  CheckCircle2,
  Loader2,
  FolderOpen,
  CalendarDays,
  DollarSign,
  Users,
  Save,
  Trash2,
  RefreshCw,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportCSV(rows, month, year) {
  const headers = ['Employee Name','Staff ID','Department','Month','Year','Hours','Hourly Rate (GHS)','Total Cost (GHS)','Status']
  const csvRows = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.employee_name}"`,
      `"${r.staff_id || ''}"`,
      `"${r.departments?.name || ''}"`,
      MONTHS[r.entry_month - 1],
      r.entry_year,
      r.hours_assigned,
      r.hourly_rate,
      r.total_cost,
      r.status,
    ].join(','))
  ]
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `extra_hours_${MONTHS[month-1]}_${year}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Component ──────────────────────────────────────────────────────────
export const ExtraHoursPage = () => {
  const { profile } = useAuth()

  // Filter state
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear,  setSelectedYear]  = useState(currentYear)
  const [searchText,    setSearchText]    = useState('')

  // Data
  const [shiftEmployees,  setShiftEmployees]  = useState([])   // profiles with category=Shift
  const [extraHoursMap,   setExtraHoursMap]   = useState({})   // profile_id -> extra_hours row
  const [loading,         setLoading]         = useState(true)

  // Inline edit state: { [profileId]: { hours, notes } }
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState({})
  const [deleting, setDeleting] = useState({})

  // Summaries
  const [summary, setSummary] = useState({ totalEntries: 0, totalHours: 0, totalCost: 0 })

  // ── Fetch shift employees ──────────────────────────────────────────────────
  const fetchShiftEmployees = useCallback(async () => {
    try {
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
    }
  }, [])

  // ── Fetch extra_hours for the selected month/year ──────────────────────────
  const fetchExtraHours = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('extra_hours')
        .select(`*, departments(name)`)
        .eq('entry_month', selectedMonth)
        .eq('entry_year',  selectedYear)
      if (error) throw error
      const map = {}
      ;(data || []).forEach(row => { map[row.profile_id] = row })
      setExtraHoursMap(map)

      // Compute summaries
      const allRows = data || []
      setSummary({
        totalEntries: allRows.length,
        totalHours:   allRows.reduce((s, r) => s + Number(r.hours_assigned || 0), 0),
        totalCost:    allRows.reduce((s, r) => s + Number(r.total_cost || 0), 0),
      })
    } catch (err) {
      console.error('Failed to load extra hours:', err.message)
      toast.error('Failed to load extra hours records.')
    }
  }, [selectedMonth, selectedYear])

  // ── Initial & reactive load ────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchShiftEmployees(), fetchExtraHours()])
      setLoading(false)
    }
    load()
  }, [fetchShiftEmployees, fetchExtraHours])

  // ── Edit helpers ───────────────────────────────────────────────────────────
  const getEditValue = (profileId, field, fallback = '') => {
    if (edits[profileId] && edits[profileId][field] !== undefined) return edits[profileId][field]
    const existing = extraHoursMap[profileId]
    if (existing && existing[field] !== undefined) return existing[field]
    return fallback
  }

  const setEditField = (profileId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [profileId]: { ...(prev[profileId] || {}), [field]: value }
    }))
  }

  // ── Save / Upsert ──────────────────────────────────────────────────────────
  const handleSave = async (emp) => {
    const hours = parseFloat(getEditValue(emp.id, 'hours_assigned', ''))
    if (isNaN(hours) || hours < 0) {
      toast.error('Please enter a valid number of hours.')
      return
    }
    const notes = getEditValue(emp.id, 'notes', '')
    const hourlyRate = Number(emp.hourly_rate || 0)

    setSaving(prev => ({ ...prev, [emp.id]: true }))
    try {
      const existing = extraHoursMap[emp.id]
      const payload = {
        profile_id:    emp.id,
        employee_name: emp.full_name,
        staff_id:      emp.staff_id || null,
        department_id: emp.department_id || null,
        entry_month:   selectedMonth,
        entry_year:    selectedYear,
        hours_assigned: hours,
        hourly_rate:    hourlyRate,
        status:         'Approved',
        approved_by:    profile.id,
        approved_at:    new Date().toISOString(),
        created_by:     profile.id,
        notes:          notes || null,
      }

      let error
      if (existing) {
        // Update
        const { error: updateErr } = await supabase
          .from('extra_hours')
          .update({ hours_assigned: hours, hourly_rate: hourlyRate, notes: notes || null, status: 'Approved', approved_by: profile.id, approved_at: new Date().toISOString() })
          .eq('id', existing.id)
        error = updateErr
      } else {
        // Insert
        const { error: insertErr } = await supabase
          .from('extra_hours')
          .insert(payload)
        error = insertErr
      }

      if (error) throw error

      toast.success(`Extra hours saved for ${emp.full_name}.`)
      // Clear local edit for this employee after save
      setEdits(prev => { const next = { ...prev }; delete next[emp.id]; return next })
      await fetchExtraHours()
    } catch (err) {
      console.error('Save extra hours failed:', err.message)
      toast.error(err.message || 'Failed to save extra hours.')
    } finally {
      setSaving(prev => ({ ...prev, [emp.id]: false }))
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (emp) => {
    const existing = extraHoursMap[emp.id]
    if (!existing) return
    if (!window.confirm(`Remove extra hours entry for ${emp.full_name} (${MONTHS[selectedMonth - 1]} ${selectedYear})?`)) return

    setDeleting(prev => ({ ...prev, [emp.id]: true }))
    try {
      const { error } = await supabase.from('extra_hours').delete().eq('id', existing.id)
      if (error) throw error
      toast.success(`Entry removed for ${emp.full_name}.`)
      setEdits(prev => { const next = { ...prev }; delete next[emp.id]; return next })
      await fetchExtraHours()
    } catch (err) {
      console.error('Delete extra hours failed:', err.message)
      toast.error(err.message || 'Failed to remove entry.')
    } finally {
      setDeleting(prev => ({ ...prev, [emp.id]: false }))
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = Object.values(extraHoursMap)
    if (rows.length === 0) {
      toast.error('No records to export for the selected period.')
      return
    }
    exportCSV(rows, selectedMonth, selectedYear)
    toast.success('Export downloaded successfully.')
  }

  // ── Filtered employees ─────────────────────────────────────────────────────
  const filteredEmployees = shiftEmployees.filter(emp => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.staff_id?.toLowerCase().includes(q) ||
      emp.departments?.name?.toLowerCase().includes(q)
    )
  })

  // ── Year options ───────────────────────────────────────────────────────────
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 font-sans">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans flex items-center gap-2">
            <Clock4 size={20} className="text-[#006939]" />
            Extra Hours
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Assign and approve additional hours for <span className="font-semibold text-[#0288D1]">Shift</span> category employees. Hours are converted to cost using each employee's hourly rate.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] shrink-0"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-28">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#0288D1]"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Entries</p>
              <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-1 tracking-tight">{summary.totalEntries}</h3>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-xl text-[#0288D1] shrink-0"><Users size={18} /></div>
          </div>
          <p className="text-xs text-gray-400 pl-2">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
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
          <p className="text-xs text-gray-400 pl-2">Cumulative approved extra hours.</p>
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
          <p className="text-xs text-gray-400 pl-2">Hours × employee hourly rate.</p>
        </div>
      </div>

      {/* ── Controls: Month / Year / Search ───────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">

          {/* Month selector */}
          <div className="min-w-[150px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Month</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year selector */}
          <div className="min-w-[110px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Search</label>
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

          {/* Refresh button */}
          <button
            onClick={async () => { setLoading(true); await fetchExtraHours(); setLoading(false) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-all self-end"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 font-semibold">
          <CalendarDays size={13} className="text-[#006939]" />
          <span>Showing: <span className="text-[#006939]">{MONTHS[selectedMonth - 1]} {selectedYear}</span></span>
          <span className="text-gray-300">•</span>
          <span>{filteredEmployees.length} Shift employees</span>
        </div>
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
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : filteredEmployees.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-4">Employee Name</th>
                  <th className="px-5 py-4">Staff ID</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-5 py-4">Hourly Rate</th>
                  <th className="px-5 py-4">Hours Assigned</th>
                  <th className="px-5 py-4">Est. Cost</th>
                  <th className="px-5 py-4">Notes</th>
                  <th className="px-5 py-4 text-center">Status</th>
                  <th className="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredEmployees.map(emp => {
                  const existing    = extraHoursMap[emp.id]
                  const hoursVal    = getEditValue(emp.id, 'hours_assigned', existing ? existing.hours_assigned : '')
                  const notesVal    = getEditValue(emp.id, 'notes', existing?.notes || '')
                  const hourlyRate  = Number(emp.hourly_rate || 0)
                  const hoursNum    = parseFloat(hoursVal) || 0
                  const previewCost = hoursNum * hourlyRate
                  const isDirty     = edits[emp.id] !== undefined
                  const isSavingRow = saving[emp.id]
                  const isDeletingRow = deleting[emp.id]

                  return (
                    <tr key={emp.id} className={`transition-colors ${existing ? 'bg-[#E8F5EE]/20 hover:bg-[#E8F5EE]/40' : 'hover:bg-gray-50/60'}`}>

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
                          className="w-36 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939] bg-gray-50 focus:bg-white transition-all placeholder-gray-400"
                        />
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3 text-center">
                        {existing ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#D1FAE5] text-[#065F46] border border-[#059669]">
                            <CheckCircle2 size={10} />
                            Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            —
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleSave(emp)}
                            disabled={isSavingRow || (!isDirty && !existing)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97] shadow-sm
                              ${isDirty
                                ? 'bg-[#006939] hover:bg-[#004D2A] text-white'
                                : existing
                                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }
                              disabled:opacity-50
                            `}
                            title={existing ? 'Update entry' : 'Save entry'}
                          >
                            {isSavingRow ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Save size={12} />
                            )}
                            {existing ? 'Update' : 'Approve'}
                          </button>

                          {existing && (
                            <button
                              onClick={() => handleDelete(emp)}
                              disabled={isDeletingRow}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Remove entry"
                            >
                              {isDeletingRow ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
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
            <p className="text-xs text-gray-400 text-center max-w-xs">
              Make sure employees are assigned the <span className="font-bold text-[#0288D1]">Shift</span> category in the Users directory.
            </p>
          </div>
        )}
      </div>

      {/* Legend note */}
      {!loading && filteredEmployees.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Highlighted rows (green) already have an entry for <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong>. 
          Modify the hours and click <strong>Update</strong> to save changes.
        </p>
      )}
    </div>
  )
}

export default ExtraHoursPage
