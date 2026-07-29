import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { 
  X, 
  User, 
  Mail, 
  Shield, 
  Clock, 
  DollarSign, 
  Calendar, 
  Briefcase, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  FileText, 
  Loader2,
  Tag,
  BadgeCheck,
  TrendingUp
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// Helper to safely format currency
const safeCurrency = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const EmployeeDetailsModal = ({ employee, isOpen, onClose, departmentName }) => {
  const [overtimeRecords, setOvertimeRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen || !employee) return

    const fetchEmployeeOvertime = async () => {
      setLoading(true)
      try {
        // Query overtime records matching staff_id, profile id, or full_name
        const matchConditions = []
        if (employee.staff_id) matchConditions.push(`employee_id.eq.${employee.staff_id}`)
        if (employee.id) matchConditions.push(`employee_id.eq.${employee.id}`)
        if (employee.full_name) matchConditions.push(`employee_name.eq.${employee.full_name}`)

        let query = supabase
          .from('overtime_records')
          .select(`
            *,
            capturer:captured_by ( full_name )
          `)
          .order('work_date', { ascending: false })

        if (matchConditions.length > 0) {
          query = query.or(matchConditions.join(','))
        }

        const { data, error } = await query
        if (error) throw error

        setOvertimeRecords(data || [])
      } catch (err) {
        console.error("Error loading employee overtime records:", err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchEmployeeOvertime()
  }, [isOpen, employee])

  if (!isOpen || !employee) return null

  // Calculate summary metrics
  const totalEntries = overtimeRecords.length
  const totalHours = overtimeRecords.reduce((sum, r) => sum + (Number(r.overtime_hours) || 0), 0)
  const totalPayout = overtimeRecords.reduce((sum, r) => sum + (Number(r.estimated_payout) || 0), 0)

  const approvedCount = overtimeRecords.filter(r => r.status === 'Approved').length
  const pendingCount = overtimeRecords.filter(r => r.status === 'Pending').length
  const declinedCount = overtimeRecords.filter(r => r.status === 'Declined').length

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} />
            Approved
          </span>
        )
      case 'Declined':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <XCircle size={12} />
            Declined
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle size={12} />
            Pending
          </span>
        )
    }
  }

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'supervisor':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'rep':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 font-sans">
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
      />

      {/* Modal Card */}
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-5xl max-h-[90vh] overflow-hidden z-10 flex flex-col relative animate-scale-up">
        
        {/* Modal Header */}
        <div className="bg-[#006939] px-6 sm:px-8 py-5 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl">
              <User size={24} className="text-[#FDB913]" />
            </div>
            <div>
              <h3 className="text-lg font-[900] uppercase tracking-wide">
                Employee Dossier & Overtime Profile
              </h3>
              <p className="text-xs text-white/70">
                Detailed profile parameters and captured overtime records
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-full p-2 hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
          
          {/* Employee Info Header Card */}
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border border-gray-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#006939]"></div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Main Avatar & Name */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#006939]/10 text-[#006939] flex items-center justify-center font-bold text-2xl shrink-0 border border-[#006939]/20 shadow-inner">
                  {employee.full_name ? employee.full_name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-[900] text-[#1A1A1A]">
                      {employee.full_name}
                    </h2>
                    {employee.staff_id && (
                      <span className="px-2.5 py-0.5 rounded-md bg-[#006939]/10 text-[#006939] text-xs font-mono font-bold border border-[#006939]/20">
                        {employee.staff_id}
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${getRoleBadge(employee.role)}`}>
                      {employee.role || 'employee'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    {employee.position && (
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        <Briefcase size={14} className="text-gray-400" />
                        {employee.position}
                      </span>
                    )}
                    {(departmentName || employee.departments?.name) && (
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        <Building2 size={14} className="text-gray-400" />
                        {departmentName || employee.departments?.name}
                      </span>
                    )}
                    {employee.company && (
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        <Tag size={14} className="text-gray-400" />
                        {employee.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Extra Metadata Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-6">
                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Category</span>
                  <span className="font-bold text-[#1A1A1A]">{employee.category || 'Shift'}</span>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Hourly Rate</span>
                  <span className="font-bold text-[#006939]">
                    GHS {safeCurrency(employee.hourly_rate)}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Account Status</span>
                  <span className={`font-bold ${employee.is_active !== false ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {employee.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Email Address</span>
                  <span className="font-semibold text-gray-600 truncate block max-w-[140px]" title={employee.email}>
                    {employee.email}
                  </span>
                </div>

                <div>
                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[10px]">Onboarded</span>
                  <span className="font-semibold text-gray-600">
                    {employee.created_at ? format(parseISO(employee.created_at), 'MMM dd, yyyy') : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Overtime Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Overtime Hours */}
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-3 bg-[#006939] text-white rounded-xl shadow-md">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#006939] uppercase tracking-wider">Total Overtime Hours</p>
                <p className="text-2xl font-[900] text-[#1A1A1A] mt-0.5">{totalHours.toFixed(2)} hrs</p>
              </div>
            </div>

            {/* Total Estimated Payout */}
            <div className="bg-amber-50/60 border border-amber-150 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-3 bg-[#FDB913] text-[#004D2A] rounded-xl shadow-md">
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Estimated Payout</p>
                <p className="text-2xl font-[900] text-[#1A1A1A] mt-0.5">GHS {safeCurrency(totalPayout)}</p>
              </div>
            </div>

            {/* Total Entries */}
            <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Captured Logs</p>
                <p className="text-2xl font-[900] text-[#1A1A1A] mt-0.5">{totalEntries} Records</p>
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col justify-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Status Breakdown</p>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-700">{approvedCount} Approved</span>
                <span className="text-amber-700">{pendingCount} Pending</span>
                <span className="text-red-600">{declinedCount} Declined</span>
              </div>
            </div>
          </div>

          {/* Overtime Records History Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-[900] text-[#006939] uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={16} />
                <span>Captured Overtime Log History</span>
              </h4>
              <span className="text-xs text-gray-500 font-semibold">
                {overtimeRecords.length} entry/entries found
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-gray-100">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin text-[#006939]" size={28} />
                  <p className="text-xs font-bold text-gray-500">Fetching overtime history...</p>
                </div>
              </div>
            ) : overtimeRecords.length > 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="px-4 py-3 text-left">Work Date</th>
                        <th className="px-4 py-3 text-left">Shift Type</th>
                        <th className="px-4 py-3 text-left">Reason / Description</th>
                        <th className="px-4 py-3 text-center">Timing</th>
                        <th className="px-4 py-3 text-right">Hours</th>
                        <th className="px-4 py-3 text-right">Payout (GHS)</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {overtimeRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                          {/* Work Date */}
                          <td className="px-4 py-3 font-semibold text-[#1A1A1A]">
                            {record.work_date ? format(parseISO(record.work_date), 'MMM dd, yyyy') : 'N/A'}
                          </td>

                          {/* Shift Type */}
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-bold text-[10px]">
                              {record.shift_type || 'Shift'}
                            </span>
                          </td>

                          {/* Reason & Description */}
                          <td className="px-4 py-3 max-w-xs">
                            <p className="font-bold text-gray-800 truncate" title={record.reason}>{record.reason}</p>
                            {record.description && (
                              <p className="text-gray-500 text-[11px] truncate" title={record.description}>
                                {record.description}
                              </p>
                            )}
                          </td>

                          {/* Timing */}
                          <td className="px-4 py-3 text-center font-mono text-gray-600">
                            {record.time_in ? record.time_in.slice(0, 5) : '--'} - {record.time_out ? record.time_out.slice(0, 5) : '--'}
                          </td>

                          {/* Hours */}
                          <td className="px-4 py-3 text-right font-bold text-[#006939]">
                            {Number(record.overtime_hours || 0).toFixed(2)} hrs
                          </td>

                          {/* Estimated Payout */}
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {safeCurrency(record.estimated_payout)}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(record.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 gap-2">
                <Clock size={36} className="text-gray-300" />
                <p className="text-xs font-bold text-gray-600">No overtime records captured for this employee yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.98]"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  )
}

export default EmployeeDetailsModal
