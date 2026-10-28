import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { isEligibleForLeave } from '../../utils/leaveHelpers'
import * as XLSX from 'xlsx'
import { 
  Layers, 
  Search, 
  Filter, 
  User, 
  Building2, 
  CalendarDays, 
  Loader2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  TrendingDown,
  Download,
  FileSpreadsheet
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export const LeaveBalancesPage = () => {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [balances, setBalances] = useState([])

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('All')
  const [selectedDept, setSelectedDept] = useState('All')
  const [departments, setDepartments] = useState([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const fetchBalancesData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      // 1. Fetch leave types
      const { data: ltData } = await supabase
        .from('leave_types')
        .select('*')
        .order('name')
      const types = ltData || []
      setLeaveTypes(types)

      // 2. Fetch departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .order('name')
      setDepartments(deptData || [])

      // 3. Fetch active employees - EXCLUDING Abanach
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
        .neq('company', 'Abanach') // Exclude Abanach company staff
        .order('full_name')

      if (!isAdmin(profile) && profile.department_id) {
        empQuery = empQuery.eq('department_id', profile.department_id)
      }

      const { data: empData, error: empError } = await empQuery
      if (empError) throw empError
      
      // Filter out Abanach
      const emps = (empData || []).filter(isEligibleForLeave)
      setEmployees(emps)

      // 4. Fetch all approved leave requests for the selected year
      const yearStart = `${selectedYear}-01-01`
      const yearEnd = `${selectedYear}-12-31`

      let reqQuery = supabase
        .from('leave_requests')
        .select('employee_id, employee_name, department_id, leave_type_id, total_days, status')
        .eq('status', 'Approved')
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd)

      if (!isAdmin(profile) && profile.department_id) {
        reqQuery = reqQuery.eq('department_id', profile.department_id)
      }

      const { data: reqData } = await reqQuery
      const approvedRequests = reqData || []

      // 5. Fetch custom balances if any in leave_balances table
      const { data: customBals } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('year', selectedYear)

      // Map combined balance per employee and leave type
      const balanceRows = []

      emps.forEach(emp => {
        const staffId = emp.staff_id || emp.full_name

        types.forEach(lt => {
          // Check custom entitled days or fall back to default_days
          const customEntry = (customBals || []).find(
            b => b.employee_id === staffId && b.leave_type_id === lt.id
          )
          const entitled = customEntry ? Number(customEntry.entitled_days) : Number(lt.default_days || 0)

          // Calculate used days from approved requests
          const used = approvedRequests
            .filter(r => r.employee_id === staffId && r.leave_type_id === lt.id)
            .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

          const remaining = Math.max(0, entitled - used)

          balanceRows.push({
            employeeId: staffId,
            employeeName: emp.full_name,
            departmentName: emp.departments?.name || 'Department',
            departmentId: emp.department_id,
            company: emp.company || 'CBI',
            leaveTypeId: lt.id,
            leaveTypeName: lt.name,
            entitledDays: entitled,
            usedDays: used,
            remainingDays: remaining
          })
        })
      })

      setBalances(balanceRows)

    } catch (err) {
      console.error('Fetch balances error:', err.message)
      toast.error('Could not load leave balances.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBalancesData()
  }, [profile, selectedYear])

  // Filter rows
  const filteredBalances = balances.filter(b => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchName = b.employeeName.toLowerCase().includes(search)
      const matchId = b.employeeId.toLowerCase().includes(search)
      if (!matchName && !matchId) return false
    }

    if (selectedType !== 'All' && b.leaveTypeId !== selectedType) return false
    if (selectedDept !== 'All' && b.departmentId !== selectedDept) return false

    return true
  })

  // Admin Export Balances to Excel
  const handleExportBalances = () => {
    if (!isAdmin(profile)) {
      toast.error('Only Administrators are authorized to export balance reports.')
      return
    }

    if (!filteredBalances.length) {
      toast.error('No balance records found to export.')
      return
    }

    setExporting(true)
    try {
      const exportRows = filteredBalances.map(row => {
        const pct = row.entitledDays > 0 ? Math.round((row.usedDays / row.entitledDays) * 100) : 0
        return {
          'Year': selectedYear,
          'Staff ID': row.employeeId,
          'Employee Name': row.employeeName,
          'Department': row.departmentName,
          'Company': row.company,
          'Leave Category': row.leaveTypeName,
          'Entitled Days': row.entitledDays,
          'Used Days': row.usedDays,
          'Remaining Days': row.remainingDays,
          'Utilization (%)': `${pct}%`
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(exportRows)
      worksheet['!cols'] = [
        { wch: 10 }, // Year
        { wch: 14 }, // Staff ID
        { wch: 24 }, // Employee Name
        { wch: 20 }, // Department
        { wch: 12 }, // Company
        { wch: 20 }, // Leave Category
        { wch: 14 }, // Entitled Days
        { wch: 12 }, // Used Days
        { wch: 16 }, // Remaining Days
        { wch: 16 }  // Utilization
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, `Balances ${selectedYear}`)
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CBI_Leave_Balances_${selectedYear}_${format(new Date(), 'yyyyMMdd')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`Exported ${exportRows.length} balance record(s) to Excel!`)
    } catch (err) {
      console.error('Balance export error:', err)
      toast.error('Failed to export leave balances to Excel.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
              Leave Balances & Entitlements
            </h1>
            <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200 hidden sm:inline-block">
              Excludes Abanach
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Track annual statutory days, taken time off, and remaining balances per CBI team member.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Admin Excel Export Button */}
          {isAdmin(profile) && (
            <button
              onClick={handleExportBalances}
              disabled={exporting || loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              title="Export employee balances to Excel (.xlsx)"
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={16} className="text-[#FDB913]" />
              )}
              <span>Export Balances</span>
            </button>
          )}

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            {[2025, 2026, 2027, 2028].map(yr => (
              <option key={yr} value={yr}>Year {yr}</option>
            ))}
          </select>

          <button
            onClick={fetchBalancesData}
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee by name or staff ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
          />
        </div>

        <div className="w-full md:w-auto">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white"
          >
            <option value="All">All Leave Types</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
        </div>

        {isAdmin(profile) && (
          <div className="w-full md:w-auto">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white"
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Balances Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 size={32} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-semibold">Calculating leave balances...</p>
          </div>
        ) : filteredBalances.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Layers size={48} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-bold text-gray-600">No Balances Available</p>
            <p className="text-xs text-gray-400 mt-0.5">Try adjusting filters or onboarding CBI department staff (Abanach staff excluded).</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Employee</th>
                  <th className="py-3.5 px-6">Department</th>
                  <th className="py-3.5 px-6">Leave Category</th>
                  <th className="py-3.5 px-6">Entitled</th>
                  <th className="py-3.5 px-6">Used (Days)</th>
                  <th className="py-3.5 px-6">Available</th>
                  <th className="py-3.5 px-6 text-right">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                {filteredBalances.map((row, idx) => {
                  const percentUsed = row.entitledDays > 0 
                    ? Math.min(100, Math.round((row.usedDays / row.entitledDays) * 100))
                    : 0

                  return (
                    <tr key={`${row.employeeId}-${row.leaveTypeId}-${idx}`} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <p className="font-bold text-gray-900">{row.employeeName}</p>
                        <p className="text-[11px] text-gray-400">ID: {row.employeeId}</p>
                      </td>
                      <td className="py-3.5 px-6 text-gray-600">
                        {row.departmentName}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-gray-800">
                        {row.leaveTypeName}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-bold text-gray-700">{row.entitledDays}</span>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="font-bold text-amber-700">{row.usedDays}</span>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-emerald-50 text-[#006939] font-black text-xs border border-emerald-100">
                          {row.remainingDays} days
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                percentUsed > 80 ? 'bg-rose-500' : percentUsed > 50 ? 'bg-amber-500' : 'bg-[#006939]'
                              }`}
                              style={{ width: `${percentUsed}%` }}
                            ></div>
                          </div>
                          <span className="text-[11px] font-bold text-gray-500 w-8 text-right">
                            {percentUsed}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default LeaveBalancesPage
