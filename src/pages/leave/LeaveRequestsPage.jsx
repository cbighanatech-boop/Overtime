import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { canApplyLeave, canReviewLeave, LEAVE_STATUS_COLORS, getEntitlementBreakdown } from '../../utils/leaveHelpers'
import * as XLSX from 'xlsx'
import { 
  PlusCircle, 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock, 
  CalendarDays, 
  User, 
  Building2, 
  FileText, 
  ChevronRight, 
  Loader2, 
  RefreshCw, 
  AlertCircle,
  Eye,
  Check,
  X,
  MessageSquare,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  Lock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export const LeaveRequestsPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [requests, setRequests] = useState([])
  const [departments, setDepartments] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All') // All, Pending, Approved, Declined, Cancelled
  const [deptFilter, setDeptFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [activeRequest, setActiveRequest] = useState(null)
  const [reviewDecision, setReviewDecision] = useState('Approved') // 'Approved' | 'Declined'
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Balance lookup helpers to check if leave requests exceed limit
  const [empMap, setEmpMap] = useState(new Map())
  const [customBals, setCustomBals] = useState([])
  const [approvedList, setApprovedList] = useState([])

  const fetchLeaveRequests = async () => {
    if (!profile) return
    setLoading(true)
    try {
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          departments (name),
          leave_types (name, default_days),
          captured_by_profile:profiles!leave_requests_captured_by_fkey (full_name, role),
          reviewed_by_profile:profiles!leave_requests_reviewed_by_fkey (full_name, role)
        `)
        .order('captured_at', { ascending: false })

      // Department restriction: Reps and Supervisors only see their own department
      if (!isAdmin(profile) && profile.department_id) {
        query = query.eq('department_id', profile.department_id)
      }

      const { data, error } = await query
      if (error) throw error
      setRequests(data || [])

      // Fetch lookup tables
      const { data: deptData } = await supabase.from('departments').select('id, name').order('name')
      if (deptData) setDepartments(deptData)

      const { data: ltData } = await supabase.from('leave_types').select('id, name, default_days').order('name')
      if (ltData) setLeaveTypes(ltData)

      // Fetch employee metadata for dynamic entitlement calculation
      const { data: emps } = await supabase
        .from('profiles')
        .select('id, full_name, staff_id, date_of_engagement, native_status, department_id')
      const mapping = new Map()
      ;(emps || []).forEach(e => {
        mapping.set(e.id, e)
        if (e.staff_id) mapping.set(e.staff_id, e)
        if (e.full_name) mapping.set(e.full_name, e)
      })
      setEmpMap(mapping)

      // Fetch custom balances
      const { data: cBals } = await supabase.from('leave_balances').select('*')
      if (cBals) setCustomBals(cBals)

      // Fetch all approved requests for balance verification
      const { data: appReqs } = await supabase
        .from('leave_requests')
        .select('id, employee_id, employee_name, leave_type_id, total_days, start_date')
        .eq('status', 'Approved')
      if (appReqs) setApprovedList(appReqs)

    } catch (err) {
      console.error('Fetch leave requests error:', err.message)
      toast.error('Failed to load leave requests.')
    } finally {
      setLoading(false)
    }
  }

  // Calculate whether an individual leave request exceeds the available balance
  const getRequestOverLimitStatus = (req) => {
    if (!req) return { exceedsLimit: false, availableDays: 0, entitledDays: 0, approvedDays: 0 }
    const year = new Date(req.start_date || new Date()).getFullYear()
    const emp = empMap.get(req.employee_id) || empMap.get(req.employee_name)
    const lt = req.leave_types || leaveTypes.find(t => t.id === req.leave_type_id)

    // Check custom balance entry
    const custom = (customBals || []).find(
      b => (b.employee_id === req.employee_id || b.employee_id === emp?.staff_id) &&
           b.leave_type_id === req.leave_type_id &&
           b.year === year
    )

    let entitled = 0
    if (custom && custom.entitled_days !== null && custom.entitled_days !== undefined) {
      entitled = Number(custom.entitled_days)
    } else if (lt) {
      const breakdown = getEntitlementBreakdown(emp, lt, year)
      entitled = breakdown.entitled
    }

    // Approved days already taken this year, excluding this request
    const approvedDays = (approvedList || [])
      .filter(r => {
        const rYear = new Date(r.start_date).getFullYear()
        return (r.employee_id === req.employee_id || r.employee_id === emp?.staff_id) &&
               r.leave_type_id === req.leave_type_id &&
               rYear === year &&
               r.id !== req.id
      })
      .reduce((sum, r) => sum + Number(r.total_days || 0), 0)

    const availableDays = Math.max(0, entitled - approvedDays)
    const requestedDays = Number(req.total_days || 0)
    const exceedsLimit = requestedDays > availableDays

    return {
      entitledDays: entitled,
      approvedDays,
      availableDays,
      requestedDays,
      exceedsLimit
    }
  }

  useEffect(() => {
    fetchLeaveRequests()

    // Realtime subscription
    const channel = supabase
      .channel('realtime-leave-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchLeaveRequests()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  // Open Review Modal
  const handleOpenReview = (request, decision) => {
    const limitInfo = getRequestOverLimitStatus(request)
    
    // Rule: When an employee exceeds the limit of leave entitlement,
    // the Supervisor cannot approve; only Admin can.
    if (decision === 'Approved' && limitInfo.exceedsLimit && !isAdmin(profile)) {
      toast.error('Limit Exceeded: Only Administrators are authorized to approve over-limit leave applications.', {
        duration: 5000
      })
      setReviewDecision('Declined')
    } else {
      setReviewDecision(decision)
    }

    setActiveRequest(request)
    setReviewComment('')
    setReviewModalOpen(true)
  }

  // Submit Review (Supervisor / Admin)
  const handleSubmitReview = async (e) => {
    e.preventDefault()
    if (!activeRequest || !canReviewLeave(profile, activeRequest)) {
      toast.error('You do not have permission to review this leave request.')
      return
    }

    const limitInfo = getRequestOverLimitStatus(activeRequest)
    if (reviewDecision === 'Approved' && limitInfo.exceedsLimit && !isAdmin(profile)) {
      toast.error('Department Supervisors cannot approve leave requests that exceed the entitlement limit. Only Administrators can approve.')
      return
    }

    if (reviewDecision === 'Declined' && !reviewComment.trim()) {
      toast.error('Please state a reason for declining the leave application.')
      return
    }

    setSubmittingReview(true)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: reviewDecision,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeRequest.id)

      if (error) throw error

      toast.success(
        `Leave request for ${activeRequest.employee_name} has been ${reviewDecision.toLowerCase()}.`
      )
      setReviewModalOpen(false)
      setActiveRequest(null)
      fetchLeaveRequests()
    } catch (err) {
      console.error('Review submit error:', err.message)
      toast.error(err.message || 'Failed to submit review.')
    } finally {
      setSubmittingReview(false)
    }
  }

  // Filter requests
  const filteredRequests = requests.filter(req => {
    // Search
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchName = req.employee_name?.toLowerCase().includes(search)
      const matchId = req.employee_id?.toLowerCase().includes(search)
      const matchReason = req.reason?.toLowerCase().includes(search)
      if (!matchName && !matchId && !matchReason) return false
    }

    // Status
    if (statusFilter !== 'All' && req.status !== statusFilter) return false

    // Department
    if (deptFilter !== 'All' && req.department_id !== deptFilter) return false

    // Leave Type
    if (typeFilter !== 'All' && req.leave_type_id !== typeFilter) return false

    return true
  })

  // Export to Excel handler (Admin user extraction)
  const handleExportExcel = () => {
    if (!isAdmin(profile)) {
      toast.error('Only Administrators are authorized to export leave records to Excel.')
      return
    }

    if (!filteredRequests.length) {
      toast.error('No leave records found matching your filters to export.')
      return
    }

    setExporting(true)
    try {
      const exportRows = filteredRequests.map(req => ({
        'Staff ID': req.employee_id || '',
        'Employee Name': req.employee_name || '',
        'Department': req.departments?.name || '',
        'Leave Category': req.leave_types?.name || '',
        'Start Date': req.start_date || '',
        'End Date': req.end_date || '',
        'Working Days': Number(req.total_days || 0),
        'Status': req.status || '',
        'Reason for Leave': req.reason || '',
        'Relief / Cover Staff': req.relief_staff_name || 'N/A',
        'Emergency Phone': req.contact_phone || 'N/A',
        'Handover Notes': req.handover_notes || '',
        'Captured By': req.captured_by_profile?.full_name || '',
        'Captured Date': req.captured_at ? format(parseISO(req.captured_at), 'yyyy-MM-dd HH:mm') : '',
        'Reviewed By': req.reviewed_by_profile?.full_name || '',
        'Reviewed Date': req.reviewed_at ? format(parseISO(req.reviewed_at), 'yyyy-MM-dd HH:mm') : '',
        'Supervisor Comments': req.review_comment || ''
      }))

      const worksheet = XLSX.utils.json_to_sheet(exportRows)

      // Set readable column widths
      worksheet['!cols'] = [
        { wch: 14 }, // Staff ID
        { wch: 24 }, // Employee Name
        { wch: 20 }, // Department
        { wch: 18 }, // Leave Category
        { wch: 13 }, // Start Date
        { wch: 13 }, // End Date
        { wch: 14 }, // Working Days
        { wch: 12 }, // Status
        { wch: 32 }, // Reason
        { wch: 20 }, // Relief Staff
        { wch: 16 }, // Contact Phone
        { wch: 28 }, // Handover Notes
        { wch: 20 }, // Captured By
        { wch: 18 }, // Captured Date
        { wch: 20 }, // Reviewed By
        { wch: 18 }, // Reviewed Date
        { wch: 32 }  // Supervisor Comments
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave Requests')
      
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CBI_Leave_Requests_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`Successfully exported ${exportRows.length} leave records to Excel!`)
    } catch (err) {
      console.error('Excel export failed:', err)
      toast.error('Failed to export leave data to Excel.')
    } finally {
      setExporting(false)
    }
  }

  // Count summaries
  const pendingCount = requests.filter(r => r.status === 'Pending').length
  const approvedCount = requests.filter(r => r.status === 'Approved').length
  const declinedCount = requests.filter(r => r.status === 'Declined').length

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
            Leave Requests & Approvals
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Track, review, and decide on employee leave applications across your department.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin Excel Extraction Button */}
          {isAdmin(profile) && (
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              title="Export all filtered leave records to Excel (.xlsx)"
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={16} className="text-[#FDB913]" />
              )}
              <span>Export to Excel</span>
            </button>
          )}

          <button
            onClick={fetchLeaveRequests}
            className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh requests"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {canApplyLeave(profile) && (
            <Link
              to="/leave/requests/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98]"
            >
              <PlusCircle size={16} />
              <span>Apply for Leave</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Quick Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <button
          onClick={() => setStatusFilter('All')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'All'
              ? 'bg-[#006939] text-white border-[#006939] shadow-md'
              : 'bg-white text-gray-800 border-gray-200 hover:border-gray-300 shadow-sm'
          }`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-wider ${statusFilter === 'All' ? 'text-white/70' : 'text-gray-400'}`}>
            Total Applications
          </p>
          <p className="text-2xl font-black mt-1">{requests.length}</p>
        </button>

        <button
          onClick={() => setStatusFilter('Pending')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'Pending'
              ? 'bg-amber-500 text-white border-amber-500 shadow-md'
              : 'bg-white text-gray-800 border-gray-200 hover:border-amber-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-wider ${statusFilter === 'Pending' ? 'text-white/80' : 'text-amber-700'}`}>
              Pending Review
            </p>
            {pendingCount > 0 && (
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'Pending' ? 'bg-white' : 'bg-amber-500'} animate-ping`}></span>
            )}
          </div>
          <p className="text-2xl font-black mt-1">{pendingCount}</p>
        </button>

        <button
          onClick={() => setStatusFilter('Approved')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'Approved'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
              : 'bg-white text-gray-800 border-gray-200 hover:border-emerald-300 shadow-sm'
          }`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-wider ${statusFilter === 'Approved' ? 'text-white/80' : 'text-emerald-700'}`}>
            Approved
          </p>
          <p className="text-2xl font-black mt-1">{approvedCount}</p>
        </button>

        <button
          onClick={() => setStatusFilter('Declined')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'Declined'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md'
              : 'bg-white text-gray-800 border-gray-200 hover:border-rose-300 shadow-sm'
          }`}
        >
          <p className={`text-[11px] font-bold uppercase tracking-wider ${statusFilter === 'Declined' ? 'text-white/80' : 'text-rose-700'}`}>
            Declined
          </p>
          <p className="text-2xl font-black mt-1">{declinedCount}</p>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee name, staff ID, or leave purpose..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
          />
        </div>

        {/* Leave Type Filter */}
        <div className="w-full md:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white"
          >
            <option value="All">All Leave Types</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
        </div>

        {/* Department Filter (Admin only) */}
        {isAdmin(profile) && (
          <div className="w-full md:w-auto">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
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

      {/* Table / List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 size={32} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-semibold">Loading leave requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-700">No Leave Requests Found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              There are currently no leave records matching the chosen filters.
            </p>
            {canApplyLeave(profile) && (
              <Link
                to="/leave/requests/new"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#006939] text-white font-bold text-xs shadow-md"
              >
                <PlusCircle size={14} />
                <span>Submit New Request</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Employee</th>
                  <th className="py-3.5 px-6">Leave Type</th>
                  <th className="py-3.5 px-6">Leave Period</th>
                  <th className="py-3.5 px-6">Days</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Captured By</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredRequests.map((req) => {
                  const statusBadge = LEAVE_STATUS_COLORS[req.status] || LEAVE_STATUS_COLORS.Pending
                  const supervisorCanReview = canReviewLeave(profile, req)
                  const limitInfo = getRequestOverLimitStatus(req)
                  const canApproveThis = isAdmin(profile) || (!limitInfo.exceedsLimit && supervisorCanReview)

                  return (
                    <tr key={req.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Employee */}
                      <td className="py-4 px-6">
                        <div>
                          <p className="font-bold text-gray-900">{req.employee_name}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <span>ID: {req.employee_id}</span>
                            <span>•</span>
                            <span>{req.departments?.name || 'Department'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Leave Type */}
                      <td className="py-4 px-6">
                        <span className="font-semibold text-gray-800">
                          {req.leave_types?.name || 'Leave'}
                        </span>
                      </td>

                      {/* Period */}
                      <td className="py-4 px-6">
                        <div className="text-xs">
                          <p className="font-semibold text-gray-800">
                            {format(parseISO(req.start_date), 'dd MMM yyyy')} – {format(parseISO(req.end_date), 'dd MMM yyyy')}
                          </p>
                          <p className="text-gray-400 text-[11px] mt-0.5 truncate max-w-xs" title={req.reason}>
                            "{req.reason}"
                          </p>
                        </div>
                      </td>

                      {/* Days */}
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-[#006939] font-extrabold text-xs border border-emerald-100">
                          {req.total_days} {Number(req.total_days) === 1 ? 'day' : 'days'}
                        </span>
                        {req.status === 'Pending' && limitInfo.exceedsLimit && (
                          <div className="mt-1">
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200"
                              title={`Requested: ${req.total_days}d, Available: ${limitInfo.availableDays}d (Exceeds by ${req.total_days - limitInfo.availableDays}d)`}
                            >
                              <AlertTriangle size={10} />
                              Exceeds Limit
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
                          <span>{req.status}</span>
                        </span>
                        {req.review_comment && (
                          <p className="text-[10px] text-gray-500 mt-1 max-w-[140px] truncate" title={req.review_comment}>
                            Note: {req.review_comment}
                          </p>
                        )}
                      </td>

                      {/* Captured By */}
                      <td className="py-4 px-6 text-xs text-gray-600">
                        <p className="font-medium text-gray-800">
                          {req.captured_by_profile?.full_name || 'Rep'}
                        </p>
                        <p className="text-gray-400 text-[11px]">
                          {req.captured_at ? format(parseISO(req.captured_at), 'dd MMM, HH:mm') : ''}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Decisions if pending */}
                          {supervisorCanReview && req.status === 'Pending' && (
                            <>
                              {canApproveThis ? (
                                <button
                                  onClick={() => handleOpenReview(req, 'Approved')}
                                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                  title={limitInfo.exceedsLimit ? "Approve Request (Administrator Override)" : "Approve Request"}
                                >
                                  <Check size={16} />
                                </button>
                              ) : (
                                <button
                                  disabled
                                  className="p-1.5 rounded-lg bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none"
                                  title="Over entitlement limit: Supervisor approval disabled. Only Administrators can approve."
                                >
                                  <Lock size={15} />
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenReview(req, 'Declined')}
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                title="Decline Request"
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}

                          <Link
                            to={`/leave/requests/${req.id}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#006939] hover:bg-gray-100 transition-colors"
                            title="View Full Details"
                          >
                            <Eye size={16} />
                          </Link>
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

      {/* SUPERVISOR / ADMIN REVIEW MODAL */}
      {reviewModalOpen && activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className={`p-5 text-white flex items-center justify-between ${
              reviewDecision === 'Approved' ? 'bg-[#006939]' : 'bg-rose-700'
            }`}>
              <div className="flex items-center gap-2">
                {reviewDecision === 'Approved' ? (
                  <CheckCircle size={20} className="text-[#FDB913]" />
                ) : (
                  <XCircle size={20} className="text-white" />
                )}
                <h3 className="font-bold text-base">
                  {reviewDecision === 'Approved' ? 'Approve Leave Request' : 'Decline Leave Request'}
                </h3>
              </div>
              <button 
                onClick={() => setReviewModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            {(() => {
              const activeLimit = activeRequest ? getRequestOverLimitStatus(activeRequest) : null
              const isOver = activeLimit?.exceedsLimit
              const supervisorCannotApprove = isOver && !isAdmin(profile)

              return (
                <form onSubmit={handleSubmitReview} className="p-6 space-y-4">
              {/* Employee Summary Card */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold uppercase">Employee:</span>
                  <strong className="text-gray-900">{activeRequest.employee_name} ({activeRequest.employee_id})</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold uppercase">Leave Type:</span>
                  <span className="font-semibold text-gray-800">{activeRequest.leave_types?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold uppercase">Period:</span>
                  <span className="font-semibold text-[#006939]">
                    {format(parseISO(activeRequest.start_date), 'dd MMM')} – {format(parseISO(activeRequest.end_date), 'dd MMM yyyy')} ({activeRequest.total_days} days)
                  </span>
                </div>
                <div className="pt-1 text-gray-600 italic">
                  "{activeRequest.reason}"
                </div>
              </div>

              {/* Over-Limit Alert Banner */}
              {isOver && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-900 font-extrabold uppercase tracking-wide">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                    <span>Entitlement Limit Exceeded</span>
                  </div>
                  <p className="text-gray-700 leading-relaxed text-[11px]">
                    This application requires <strong>{activeRequest.total_days} days</strong>, but only <strong>{activeLimit.availableDays} days</strong> remain available (Entitled: {activeLimit.entitledDays}, Taken: {activeLimit.approvedDays}).
                  </p>
                  {supervisorCannotApprove ? (
                    <div className="pt-1 text-rose-700 font-bold text-[11px] flex items-center gap-1">
                      <Lock size={12} className="shrink-0" />
                      <span>Department Supervisors cannot approve over-limit leave requests. Approval is restricted to Administrators.</span>
                    </div>
                  ) : (
                    <p className="pt-1 text-emerald-800 font-bold text-[11px]">
                      ✓ Administrator Authorization Active: You have permission to approve over-limit applications.
                    </p>
                  )}
                </div>
              )}

              {/* Review Decision Toggle */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Supervisor Decision *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={supervisorCannotApprove}
                    onClick={() => setReviewDecision('Approved')}
                    className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                      supervisorCannotApprove
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed shadow-none'
                        : reviewDecision === 'Approved'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-50'
                    }`}
                    title={supervisorCannotApprove ? 'Supervisors cannot approve over-limit applications. Admin approval required.' : ''}
                  >
                    {supervisorCannotApprove ? <Lock size={14} /> : <Check size={16} />}
                    <span>{supervisorCannotApprove ? 'Approve (Admin Only)' : 'Approve Request'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDecision('Declined')}
                    className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                      reviewDecision === 'Declined'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-rose-50'
                    }`}
                  >
                    <X size={16} />
                    <span>Decline Request</span>
                  </button>
                </div>
              </div>

              {/* Reason / Comments */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Supervisor Reason / Feedback {reviewDecision === 'Declined' ? '*' : '(Optional)'}
                </label>
                <textarea
                  rows="3"
                  required={reviewDecision === 'Declined'}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    reviewDecision === 'Declined'
                      ? 'State the reason for declining this request (e.g. Critical plant maintenance schedule)...'
                      : 'Add any approval notes or coverage instructions...'
                  }
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                ></textarea>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  disabled={submittingReview}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all text-white disabled:opacity-50 ${
                    reviewDecision === 'Approved' ? 'bg-[#006939] hover:bg-[#004D2A]' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submittingReview && <Loader2 size={14} className="animate-spin" />}
                  <span>Confirm {reviewDecision}</span>
                </button>
              </div>
            </form>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaveRequestsPage
