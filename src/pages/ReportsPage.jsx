import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../utils/roleHelpers'
import { isWeekend } from 'date-fns'
import { 
  FileSpreadsheet, 
  Filter, 
  BarChart, 
  Calendar, 
  Clock, 
  DollarSign, 
  FileCheck,
  RefreshCw,
  FolderOpen,
  ArrowRightLeft
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export const ReportsPage = () => {
  const { profile } = useAuth()
  const adminView = isAdmin(profile);

  // State Management
  const [records, setRecords] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters State
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Derived Metrics State
  const [summary, setSummary] = useState({
    totalHours: 0,
    totalPayout: 0,
    recordCount: 0
  })

  // Fetch departments list
  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name')
      if (!error && data) {
        setDepartments(data)
      }
    }
    fetchDepartments()
  }, [])

  // Fetch all filtered records for preview & export (bypasses pagination to export ALL matching)
  const loadReportsData = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('overtime_records')
        .select(`
          *,
          departments (
            name
          )
        `)

      // Apply Filters
      if (selectedDept) {
        query = query.eq('department_id', selectedDept)
      }
      if (selectedStatus) {
        query = query.eq('status', selectedStatus)
      }
      if (startDate) {
        query = query.gte('work_date', startDate)
      }
      if (endDate) {
        query = query.lte('work_date', endDate)
      }

      // Sort by date descending
      query = query.order('work_date', { ascending: false })

      const { data, error } = await query
      if (error) throw error

      setRecords(data || [])

      // Calculate aggregated metrics
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
      console.error("Error loading reports data:", err.message)
      toast.error("Failed to load reports overview.")
    } finally {
      setLoading(false)
    }
  }

  // Load when filter changes
  useEffect(() => {
    loadReportsData()
  }, [selectedDept, selectedStatus, startDate, endDate])

  // Clear filters
  const handleClearFilters = () => {
    setSelectedDept('')
    setSelectedStatus('')
    setStartDate('')
    setEndDate('')
  }

  // SheetJS Excel Export Logic
  const handleExcelExport = () => {
    if (records.length === 0) {
      toast.error("No data available to export. Try widening your filters.")
      return
    }

    try {
      // Map database rows to clean Excel column names
      const worksheetData = records.map(row => ({
        'Employee Name': row.employee_name || 'N/A',
        'Staff ID': row.employee_id || 'N/A',
        'Category': row.shift_type || 'N/A',
        'Department': row.departments?.name || 'N/A',
        'Date': row.work_date,
        'Time In': row.time_in,
        'Time Out': row.time_out,
        'Overtime Hours': Number(row.overtime_hours || 0),
        'Hourly Rate (GH₵)': adminView ? Number(row.hourly_rate || 0) : null,
        'Rate Multiplier': Number(row.rate_multiplier || 1.5),
        'Overtime x1.5': row.rate_multiplier == 1.5 ? Number(row.overtime_hours || 0) : 0,
        'Overtime x2.0': row.rate_multiplier == 2.0 ? Number(row.overtime_hours || 0) : 0,
        'Estimated Payout (GH₵)': adminView ? Number(row.estimated_payout || 0) : null,
        'Status': row.status,
        'Task Description': row.description || '',
        'Day Type': isWeekend(parseISO(row.work_date)) ? 'Weekend' : 'Weekday'
      }))

      const worksheet = XLSX.utils.json_to_sheet(worksheetData)

      // 1. Column layout widths to prevent truncation (Part 2: brand rule)
      const colWidths = [
        { wch: 22 }, // Employee Name
        { wch: 15 }, // Staff ID
        { wch: 12 }, // Category
        { wch: 16 }, // Department
        { wch: 12 }, // Date
        { wch: 10 }, // Time In
        { wch: 10 }, // Time Out
        { wch: 15 }, // Overtime Hours
        { wch: 20 }, // Hourly Rate
        { wch: 15 }, // Rate Multiplier
        { wch: 15 }, // Overtime x1.5
        { wch: 15 }, // Overtime x2.0
        { wch: 22 }, // Estimated Payout
        { wch: 12 }, // Status
        { wch: 35 }, // Task Description
        { wch: 30 }, // Reviewer Comment
        { wch: 12 }  // Day Type
      ]
      worksheet['!cols'] = colWidths

      // 2. Format cell number masks for cells
      const range = XLSX.utils.decode_range(worksheet['!ref'])
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = { c: C, r: R }
          const cell_ref = XLSX.utils.encode_cell(cell_address)
          const cell = worksheet[cell_ref]
          if (!cell) continue

          // Set cell properties for styles (Excel uses default Calibri style sheet)
          if (R > 0) {
            if (C === 8) { // Hourly Rate
              cell.t = 'n'
              cell.z = '"₵"#,##0.00'
            } else if (C === 10 || C === 11) { // Overtime hours distribution
              cell.t = 'n'
              cell.z = '0.00'
            } else if (C === 12) { // Estimated Payout
              cell.t = 'n'
              cell.z = '"₵"#,##0.00'
            }
          }
        }
      }

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Overtime Export Log')

      // Trigger excel save download
      const filename = `CBI_Overtime_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      XLSX.writeFile(workbook, filename)
      
      toast.success("Excel report exported successfully! Font standard: Calibri.")
    } catch (err) {
      console.error("Excel generation error:", err)
      toast.error("Failed to generate Excel sheet.")
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#D1FAE5] text-[#065F46] border border-[#059669]">Approved</span>
      case 'Pending':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E] border border-[#D97706]">Pending</span>
      case 'Declined':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#DC2626]">Declined</span>
      default:
        return <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800">{status}</span>
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Analytics & Reports
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Aggregate company-wide overtime capture records and run sheet export files.
          </p>
        </div>

        <button
          onClick={handleExcelExport}
          disabled={loading || records.length === 0}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50 shrink-0 font-sans"
        >
          <FileSpreadsheet size={16} />
          <span>Export Excel (SheetJS)</span>
        </button>
      </div>

      {/* -------------------------------------------------------------
          SUMMARIZED AGGREGATED METRICS
         ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-[#E8F5EE] rounded-xl text-[#006939]">
            <Clock size={20} />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Total Export Hours</span>
            <span className="text-2xl font-[900] text-[#1A1A1A] mt-1">{summary.totalHours} Hrs</span>
          </div>
        </div>

        {adminView && (
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                <DollarSign size={20} />
              </div>
              <div>
                <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Est. Budget Payout</span>
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
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Total Records Count</span>
            <span className="text-2xl font-[900] text-[#1A1A1A] mt-1">{summary.recordCount} Entries</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          FILTER CONTROL DOCK
         ------------------------------------------------------------- */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#006939] font-bold text-xs uppercase tracking-wider">
            <Filter size={16} />
            <span>Target Export Filters</span>
          </div>
          <button 
            onClick={loadReportsData} 
            className="p-1 text-gray-400 hover:text-[#006939] transition-colors"
            title="Refresh logs data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Department Select */}
          <div>
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="block w-full px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer font-medium"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          {/* Status Select */}
          <div>
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="block w-full px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer font-medium"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Declined">Declined</option>
            </select>
          </div>

          {/* Start Date Picker */}
          <div>
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer"
            />
          </div>

          {/* End Date Picker */}
          <div>
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block w-full px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer"
            />
          </div>
        </div>

        {/* Clear indicators */}
        {(selectedDept || selectedStatus || startDate || endDate) && (
          <div className="flex justify-end">
            <button
              onClick={handleClearFilters}
              className="text-xs text-red-500 font-bold hover:underline"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          EXPORT DATASET PREVIEW TABLE
         ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Export Dataset Preview
          </h4>
          <span className="text-xs font-semibold text-[#006939]">
            {records.length} matches
          </span>
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
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Employee Name</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Shift Date</th>
                  <th className="px-6 py-3.5">Hours</th>
                  {adminView && <th className="px-6 py-3.5">Rate</th>}
                  {adminView && <th className="px-6 py-3.5">Estimated Payout</th>}
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-600">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#E8F5EE]/10 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-[#1A1A1A]">{rec.employee_name}</td>
                    <td className="px-6 py-3.5 font-medium">{rec.departments?.name}</td>
                    <td className="px-6 py-3.5">{format(parseISO(rec.work_date), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-3.5 font-bold text-[#006939]">{rec.overtime_hours} Hrs</td>
                    {adminView && (
                      <td className="px-6 py-3.5 text-xs">
                        GH₵{rec.hourly_rate} ({rec.rate_multiplier}x)
                      </td>
                    )}
                    {adminView && (
                      <td className="px-6 py-3.5 font-bold text-[#006939]">
                        GH₵{rec.estimated_payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    )}
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
