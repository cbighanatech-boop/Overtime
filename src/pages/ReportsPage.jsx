import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../utils/roleHelpers'
import { Filter, Clock, DollarSign, FolderOpen, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

// Bulletproof currency formatter — never throws even if value is null/undefined/NaN
const safeCurrency = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

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
  const [totalHours, setTotalHours] = useState(0)
  const [totalPayout, setTotalPayout] = useState(0)

  // Fetch departments once on mount
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const { data } = await supabase.from('departments').select('*').order('name')
        setDepartments(data || [])
      } catch (err) {
        console.error('Fetch departments error:', err)
      }
    }
    fetchDepts()
  }, [])

  // Fetch records whenever filters change
  useEffect(() => {
    if (!profile) return

    const fetchRecords = async () => {
      setLoading(true)
      try {
        let query = supabase.from('overtime_records').select('*, departments(name)')

        if (selectedDept) query = query.eq('department_id', selectedDept)
        if (selectedStatus) query = query.eq('status', selectedStatus)
        if (startDate) query = query.gte('work_date', startDate)
        if (endDate) query = query.lte('work_date', endDate)

        const { data, error } = await query.order('work_date', { ascending: false })

        if (error) {
          console.error('Query error:', error)
          throw error
        }

        const rows = data || []
        setRecords(rows)

        let hours = 0
        let payout = 0
        for (let i = 0; i < rows.length; i++) {
          const h = parseFloat(rows[i].overtime_hours) || 0
          const p = parseFloat(rows[i].estimated_payout) || 0
          hours += h
          payout += p
        }

        setTotalHours(Math.round(hours * 10) / 10)
        setTotalPayout(Math.round(payout * 100) / 100)
      } catch (err) {
        console.error('Error fetching records:', err)
        toast.error('Failed to load records')
        setRecords([])
        setTotalHours(0)
        setTotalPayout(0)
      } finally {
        setLoading(false)
      }
    }

    fetchRecords()
  }, [profile, selectedDept, selectedStatus, startDate, endDate])

  const handleClearFilters = () => {
    setSelectedDept('')
    setSelectedStatus('')
    setStartDate('')
    setEndDate('')
  }

  const getStatusBadge = (status) => {
    const badges = {
      'Approved': 'bg-[#D1FAE5] text-[#065F46] border-[#059669]',
      'Pending': 'bg-[#FEF3C7] text-[#92400E] border-[#D97706]',
      'Declined': 'bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]'
    }
    const style = badges[status] || 'bg-gray-100 text-gray-800'
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${style}`}>{status || 'Unknown'}</span>
  }

  if (!profile) return <div className="p-8">Loading...</div>

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight">Reports</h2>
        <p className="text-xs text-gray-500 mt-1">View and export overtime records</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4">
            <Clock className="text-[#006939]" size={20} />
            <div>
              <span className="block text-xs font-bold text-gray-400">TOTAL HOURS</span>
              <span className="text-2xl font-[900]">{totalHours} Hrs</span>
            </div>
          </div>
        </div>

        {adminView && (
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
              <DollarSign className="text-emerald-600" size={20} />
              <div>
                <span className="block text-xs font-bold text-gray-400">EST. PAYOUT</span>
                <span className="text-2xl font-[900]">GH₵{safeCurrency(totalPayout)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[#006939] font-bold text-xs">
          <Filter size={16} />
          <span>FILTERS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h4 className="text-xs font-bold text-gray-500 uppercase">{records.length} Records</h4>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#006939] border-t-transparent"></div>
            <p className="text-xs text-gray-400 mt-2">Loading records...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400">
            <FolderOpen size={48} className="text-gray-300 mb-3" />
            <p className="text-sm font-semibold">No records found</p>
          </div>
        ) : (
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
                {records.map((rec) => {
                  const deptName = rec.departments?.name || 'N/A'
                  const empName = rec.employee_name || 'N/A'
                  const status = rec.status || 'Pending'
                  const hours = parseFloat(rec.overtime_hours) || 0
                  const rate = parseFloat(rec.hourly_rate) || 0
                  const mult = parseFloat(rec.rate_multiplier) || 1.5
                  const workDate = rec.work_date
                    ? format(parseISO(rec.work_date), 'MMM dd, yyyy')
                    : 'N/A'

                  return (
                    <tr key={rec.id} className="hover:bg-[#E8F5EE]/10">
                      <td className="px-6 py-3.5 font-semibold">{empName}</td>
                      <td className="px-6 py-3.5 text-gray-600">{deptName}</td>
                      <td className="px-6 py-3.5 text-gray-600">{workDate}</td>
                      <td className="px-6 py-3.5 font-bold text-[#006939]">{hours} Hrs</td>
                      {adminView && (
                        <td className="px-6 py-3.5 text-xs">
                          GH₵{safeCurrency(rate)} ({mult}x)
                        </td>
                      )}
                      {adminView && (
                        <td className="px-6 py-3.5 font-bold text-[#006939]">
                          GH₵{safeCurrency(rec.estimated_payout)}
                        </td>
                      )}
                      <td className="px-6 py-3.5">{getStatusBadge(status)}</td>
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

export default ReportsPage
