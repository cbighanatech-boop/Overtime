import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { X, Search, Loader2, Download, CalendarDays, CheckCircle2, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const currentYear = new Date().getFullYear()

const formatCurrency = (v) => {
  if (v == null) return 'GHS 0.00'
  return `GHS ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

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
  const a    = Object.assign(document.createElement('a'), { href: url, download: `extra_hours_history_${MONTHS[month-1]}_${year}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

export const ExtraHoursHistoryModal = ({ isOpen, onClose }) => {
  const { profile } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [searchText, setSearchText] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('extra_hours')
        .select(`*, departments(name)`)
        .eq('entry_month', selectedMonth)
        .eq('entry_year', selectedYear)
        .order('employee_name')
      
      if (error) throw error
      setRecords(data || [])
    } catch (err) {
      console.error('Failed to fetch history:', err.message)
      toast.error('Failed to load history.')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    if (isOpen) {
      fetchRecords()
    }
  }, [isOpen, fetchRecords])

  if (!isOpen) return null

  const filteredRecords = records.filter(r => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return (
      r.employee_name?.toLowerCase().includes(q) ||
      r.staff_id?.toLowerCase().includes(q) ||
      r.departments?.name?.toLowerCase().includes(q)
    )
  })

  const handleExport = () => {
    if (filteredRecords.length === 0) {
      toast.error('No records to export.')
      return
    }
    exportCSV(filteredRecords, selectedMonth, selectedYear)
    toast.success('Export downloaded.')
  }

  const handleApprove = async (record) => {
    try {
      const { error } = await supabase
        .from('extra_hours')
        .update({
          status: 'Approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', record.id)
      
      if (error) throw error
      
      toast.success(`${record.employee_name}'s hours approved.`)
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: 'Approved' } : r))
    } catch (err) {
      console.error('Failed to approve:', err.message)
      toast.error('Failed to approve hours.')
    }
  }

  const handleEdit = async (record) => {
    const newHours = window.prompt(`Enter new assigned hours for ${record.employee_name}:`, record.hours_assigned)
    if (newHours === null) return
    const parsedHours = parseFloat(newHours)
    if (isNaN(parsedHours) || parsedHours < 0) {
      toast.error('Please enter a valid positive number.')
      return
    }

    try {
      const { error } = await supabase
        .from('extra_hours')
        .update({ hours_assigned: parsedHours })
        .eq('id', record.id)

      if (error) throw error
      
      toast.success(`Updated hours for ${record.employee_name}.`)
      // Refresh to get new total_cost
      fetchRecords()
    } catch (err) {
      console.error('Failed to edit:', err.message)
      toast.error('Failed to update hours.')
    }
  }

  const handleDelete = async (record) => {
    if (!window.confirm(`Are you sure you want to permanently delete this extra hours entry for ${record.employee_name}?`)) return
    
    try {
      const { error } = await supabase
        .from('extra_hours')
        .delete()
        .eq('id', record.id)

      if (error) throw error

      toast.success(`Entry for ${record.employee_name} deleted.`)
      setRecords(prev => prev.filter(r => r.id !== record.id))
    } catch (err) {
      console.error('Failed to delete:', err.message)
      toast.error('Failed to delete entry.')
    }
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-xl font-[900] text-[#1A1A1A] tracking-tight">Extra Hours History & Review</h2>
            <p className="text-sm text-gray-500">View, approve, edit, or delete processed extra hours.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-5 border-b border-gray-100 flex flex-wrap gap-4 items-end">
          <div className="min-w-[150px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Month</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[110px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
              />
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm rounded-lg shadow-sm transition-colors"
          >
            <Download size={15} />
            Export
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="animate-spin text-[#006939]" size={24} />
            </div>
          ) : filteredRecords.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                  <th className="px-4 py-3 font-bold">Employee</th>
                  <th className="px-4 py-3 font-bold">Dept</th>
                  <th className="px-4 py-3 font-bold text-right">Hours</th>
                  <th className="px-4 py-3 font-bold text-right">Rate</th>
                  <th className="px-4 py-3 font-bold text-right">Total Cost</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                  <th className="px-4 py-3 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredRecords.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{r.employee_name}</div>
                      <div className="text-xs text-gray-500">{r.staff_id || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.departments?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{r.hours_assigned}</td>
                    <td className="px-4 py-3 text-right text-gray-600">GHS {Number(r.hourly_rate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCurrency(r.total_cost)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'Approved' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#D1FAE5] text-[#065F46]">
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FFFDE7] text-[#F57F17] border border-[#FFF9C4]">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {r.status === 'Pending' && (
                          <button
                            onClick={() => handleApprove(r)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Approve Entry"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(r)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Hours"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Entry"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
              <CalendarDays size={32} className="text-gray-300" />
              <p>No records found for this period.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
