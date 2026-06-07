import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../utils/roleHelpers'
import {
  FileSpreadsheet,
  Filter,
  Calendar,
  Clock,
  DollarSign,
  FileCheck,
  FolderOpen,
  XCircle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export const ReportsPage = () => {
  const { profile } = useAuth()
  const adminView = isAdmin(profile)

  const [records, setRecords] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [summary, setSummary] = useState({ totalHours: 0, totalPayout: 0, recordCount: 0 })

  // Fetch departments
  useEffect(() => {
    const fetchDepts = async () => {
      const { data } = await supabase.from('departments').select('*').order('name')
      setDepartments(data || [])
    }
    fetchDepts()
  }, [])

  // Fetch reports data
  const loadReportsData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      let query = supabase
        .from('overtime_records')
        .select('*, departments(name)')

      if (selectedDept) query = query.eq('department_id', selectedDept)
      if (selectedStatus) query = query.eq('status', selectedStatus)
      if (startDate) query = query.gte('work_date', startDate)
      if (endDate) query = query.lte('work_date', endDate)

      const { data, error } = await query.order('work_date', { ascending: false })

      if (error) throw error

      setRecords(data || [])

      let totalHours = 0
      let totalPayout = 0
      if (data) {
        data.forEach(rec => {
          totalHours += Number(rec.overtime_hours || 0)
          totalPayout += Number(rec.estimated_payout || 0)
        })
      }

      setSummary({
        totalHours: Number(totalHours.toFixed(1)),
        totalPayout: Number(totalPayout.toFixed(2)),
        recordCount: data?.length || 0
      })
    } catch (err) {
      console.error('Error loading reports:', err.message)
      toast.error('Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReportsData()
  }, [profile, selectedDept, selectedStatus, startDate, endDate])

  const handleClearFilters = () => {
    setSelectedDept('')
    setSelectedStatus('')
    setStartDate('')
    setEndDate('')
  }

  const handleExcelExport = () => {
    if (records.length === 0) {
      toast.error('No data to export.')
      return
    }

    try {
      const worksheetData = records.map(row => ({
        'Employee Name': row.employee_name || 'N/A',
        'Staff ID': row.employee_id || 'N/A',
        'Category': row.shift_type || 'N/A',
        'Department': row.departments?.name || 'N/A',
        'Date': row.work_date,
        'Time In': row.time_in || 'N/A',
        'Time Out': row.time_out || 'N/A',
        'Overtime Hours': Number(row.overtime_hours || 0),
        'Hourly Rate': adminView ? Number(row.hourly_rate || 0) : null,
        'Rate Multiplier': Number(row.rate_multiplier || 1.5),
        'Estimated Payout': adminView ? Number(row.estimated_payout || 0) : null,
        'Status': row.status,
        'Task Description': row.description || ''
      }))

      const worksheet = XLSX.utils.json_to_sheet(worksheetData)
      const colWidths = [
        { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 16 },
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 15 },
        { wch: 20 }, { wch: 15 }, { wch: 22 }, { wch: 12 }, { wch: 35 }
      ]
      worksheet['!cols'] = colWidths

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Overtime Export')
      XLSX.writeFile(workbook, `CBI_Overtime_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Excel report exported successfully!')
    } catch (err) {
      console.error('Export error:', err)
      toast.error('Failed to export Excel file.')
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      'Approved': 'bg-[#D1FAE5] text-[#065F46] border-[#059669]',
      'Pending': 'bg-[#FEF3C7] text-[#92400E] border-[#D97706]',
      'Declined': 'bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]'
    }
    const style = styles[status] || 'bg-gray-100 text-gray-800'
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${style}`}>{status}</span>
  }

  if (!profile) return null

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight">
            Analytics & Reports
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Aggregate company-wide overtime records and export files.
          </p>
        </div>
        <button
          onClick={handleExcelExport}
          disabled={loading || records.length === 0}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
        >
          <FileSpreadsheet size={16} />
          <span>Export Excel</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-[#E8F5EE] rounded-xl text-[#006939]">
            <Clock size={20} />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase">Total Hours</span>
            <span className="text-2xl font-[900] text-[#1A1A1A] mt-1">{summary.totalHours} Hrs</span>
          </div>
        </div>

        {adminView && (
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <DollarSign size={20} />
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase">Est. Payout</span>
              <span className="text-2xl font-[900] text-[#1A1A1A] mt-1">
                GH₵{summary.totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <FileCheck size={20} />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase">Total Records</span>
            <span className="text-2xl font-[900] text-[#1A1A1A] mt-1">{summary.recordCount} Entries</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#006939] font-bold text-xs uppercase">
            <Filter size={16} />
            <span>Filters</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Declined">Declined</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
          />
        </div>

        {(selectedDept || selectedStatus || startDate || endDate) && (
          <div className="flex justify-end">
            <button
              onClick={handleClearFilters}
              className="text-xs text-red-500 font-bold hover:underline flex items-center gap-1"
            >
              <XCircle size={14} />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h4 className="text-xs font-bold text-gray-500 uppercase">{records.length} Records</h4>
        </div>

        {loading ? (
          <div className="p-8 space-y-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-10 bg-gray-100 rounded-lg"></div>
            <div className="h-10 bg-gray-100 rounded-lg"></div>
          </div>
        ) : records.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase">
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Hours</th>
                  {adminView && <th className="px-6 py-3.5">Rate</th>}
                  {adminView && <th className="px-6 py-3.5">Payout</th>}
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#E8F5EE]/10">
                    <td className="px-6 py-3.5 font-semibold">{rec.employee_name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{rec.departments?.name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{format(parseISO(rec.work_date), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-3.5 font-bold text-[#006939]">{rec.overtime_hours} Hrs</td>
                    {adminView && <td className="px-6 py-3.5 text-xs">GH₵{rec.hourly_rate} ({rec.rate_multiplier}x)</td>}
                    {adminView && <td className="px-6 py-3.5 font-bold text-[#006939]">GH₵{Number(rec.estimated_payout).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>}
                    <td className="px-6 py-3.5">{getStatusBadge(rec.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3">
            <FolderOpen size={48} className="text-gray-300" />
            <p className="text-sm font-semibold">No records match the active criteria.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportsPage
