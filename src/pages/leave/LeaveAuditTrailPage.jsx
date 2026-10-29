import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin } from '../../utils/roleHelpers'
import { LEAVE_STATUS_COLORS } from '../../utils/leaveHelpers'
import {
  Activity,
  RefreshCw,
  Download,
  Calendar,
  FileText,
  Loader2,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Trash2,
  PlusCircle,
  ShieldCheck,
  Eye
} from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { format, parseISO, subDays } from 'date-fns'

/**
 * Leave Audit Trail Page — Admin only.
 * Shows an immutable chronological log of all leave-related actions:
 * submissions, approvals, declines, cancellations, admin edits, and admin deletions.
 */
const LeaveAuditTrailPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all') // all, 7d, 30d, 90d
  const [sortOrder, setSortOrder] = useState('desc') // desc = newest first

  // Redirect non-admin users
  useEffect(() => {
    if (profile && !isAdmin(profile)) {
      toast.error('Access denied. Only administrators can view the audit trail.')
      navigate('/leave/dashboard')
    }
  }, [profile, navigate])

  const fetchAuditLogs = async () => {
    setLoading(true)
    try {
      // Fetch all leave requests with full audit data
      const { data: requests, error } = await supabase
        .from('leave_requests')
        .select(`
          id,
          employee_id,
          employee_name,
          leave_type_id,
          department_id,
          start_date,
          end_date,
          total_days,
          status,
          reason,
          captured_by,
          captured_at,
          reviewed_by,
          reviewed_at,
          review_comment,
          created_at,
          updated_at,
          departments (name),
          leave_types (name),
          captured_by_profile:profiles!leave_requests_captured_by_fkey (full_name, role, email),
          reviewed_by_profile:profiles!leave_requests_reviewed_by_fkey (full_name, role, email)
        `)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // Build audit log entries from request lifecycle events
      const auditEntries = []

      for (const req of (requests || [])) {
        // 1. Submission event
        if (req.captured_at) {
          auditEntries.push({
            id: `${req.id}-submit`,
            request_id: req.id,
            action: 'Leave Submitted',
            action_type: 'submit',
            employee_name: req.employee_name,
            employee_id: req.employee_id,
            department: req.departments?.name || '-',
            leave_type: req.leave_types?.name || '-',
            total_days: req.total_days,
            start_date: req.start_date,
            end_date: req.end_date,
            performed_by: req.captured_by_profile?.full_name || 'System',
            performed_by_role: req.captured_by_profile?.role || '-',
            performed_at: req.captured_at,
            status: 'Pending',
            details: `Applied for ${req.total_days} day(s) of ${req.leave_types?.name || 'leave'} (${req.start_date} to ${req.end_date})`
          })
        }

        // 2. Review event (approval/decline)
        if (req.reviewed_at && (req.status === 'Approved' || req.status === 'Declined')) {
          auditEntries.push({
            id: `${req.id}-review`,
            request_id: req.id,
            action: req.status === 'Approved' ? 'Leave Approved' : 'Leave Declined',
            action_type: req.status === 'Approved' ? 'approve' : 'decline',
            employee_name: req.employee_name,
            employee_id: req.employee_id,
            department: req.departments?.name || '-',
            leave_type: req.leave_types?.name || '-',
            total_days: req.total_days,
            start_date: req.start_date,
            end_date: req.end_date,
            performed_by: req.reviewed_by_profile?.full_name || 'Reviewer',
            performed_by_role: req.reviewed_by_profile?.role || '-',
            performed_at: req.reviewed_at,
            status: req.status,
            details: req.review_comment
              ? `${req.status} with comment: "${req.review_comment}"`
              : `${req.status} — ${req.total_days} day(s) of ${req.leave_types?.name || 'leave'}`
          })
        }

        // 3. Cancellation event
        if (req.status === 'Cancelled') {
          auditEntries.push({
            id: `${req.id}-cancel`,
            request_id: req.id,
            action: 'Leave Cancelled',
            action_type: 'cancel',
            employee_name: req.employee_name,
            employee_id: req.employee_id,
            department: req.departments?.name || '-',
            leave_type: req.leave_types?.name || '-',
            total_days: req.total_days,
            start_date: req.start_date,
            end_date: req.end_date,
            performed_by: req.captured_by_profile?.full_name || 'System',
            performed_by_role: req.captured_by_profile?.role || '-',
            performed_at: req.updated_at || req.captured_at,
            status: 'Cancelled',
            details: `Cancelled — ${req.total_days} day(s) of ${req.leave_types?.name || 'leave'}`
          })
        }
      }

      // Also fetch leave_audit_logs table if it exists (for admin edits/deletes)
      try {
        const { data: auditLogs, error: auditErr } = await supabase
          .from('leave_audit_logs')
          .select('*')
          .order('performed_at', { ascending: false })

        if (!auditErr && auditLogs) {
          for (const log of auditLogs) {
            auditEntries.push({
              id: `audit-${log.id}`,
              request_id: log.request_id,
              action: log.action,
              action_type: log.action_type || 'admin',
              employee_name: log.employee_name || '-',
              employee_id: log.employee_id || '-',
              department: log.department || '-',
              leave_type: log.leave_type || '-',
              total_days: log.total_days || 0,
              start_date: log.start_date || null,
              end_date: log.end_date || null,
              performed_by: log.performed_by || 'Admin',
              performed_by_role: log.performed_by_role || 'admin',
              performed_at: log.performed_at,
              status: log.status || '-',
              details: log.details || '-'
            })
          }
        }
      } catch {
        // leave_audit_logs table may not exist yet — no problem
      }

      // Sort by performed_at descending
      auditEntries.sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at))
      setLogs(auditEntries)
    } catch (err) {
      console.error('Failed to load leave audit trail:', err.message)
      toast.error('Could not load leave audit trail.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile && isAdmin(profile)) {
      fetchAuditLogs()
    }
  }, [profile])

  // Filtered and searched logs
  const filteredLogs = useMemo(() => {
    let result = [...logs]

    // Date range filter
    if (dateRange !== 'all') {
      const days = parseInt(dateRange)
      const cutoff = subDays(new Date(), days)
      result = result.filter(log => new Date(log.performed_at) >= cutoff)
    }

    // Action type filter
    if (actionFilter !== 'all') {
      result = result.filter(log => log.action_type === actionFilter)
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(log =>
        (log.employee_name || '').toLowerCase().includes(term) ||
        (log.employee_id || '').toLowerCase().includes(term) ||
        (log.performed_by || '').toLowerCase().includes(term) ||
        (log.action || '').toLowerCase().includes(term) ||
        (log.department || '').toLowerCase().includes(term) ||
        (log.leave_type || '').toLowerCase().includes(term) ||
        (log.details || '').toLowerCase().includes(term)
      )
    }

    // Sort order
    if (sortOrder === 'asc') {
      result.sort((a, b) => new Date(a.performed_at) - new Date(b.performed_at))
    }

    return result
  }, [logs, searchTerm, actionFilter, dateRange, sortOrder])

  // Action type badge styles
  const getActionBadge = (actionType) => {
    switch (actionType) {
      case 'submit':
        return { icon: PlusCircle, bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' }
      case 'approve':
        return { icon: CheckCircle2, bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' }
      case 'decline':
        return { icon: XCircle, bg: 'bg-rose-100', text: 'text-rose-800', dot: 'bg-rose-500' }
      case 'cancel':
        return { icon: Clock, bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
      case 'edit':
        return { icon: Edit2, bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' }
      case 'delete':
        return { icon: Trash2, bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' }
      default:
        return { icon: ShieldCheck, bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' }
    }
  }

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.error('No data to export.')
      return
    }

    const exportData = filteredLogs.map(log => ({
      'Action': log.action,
      'Action Type': log.action_type,
      'Employee Name': log.employee_name,
      'Employee ID': log.employee_id,
      'Department': log.department,
      'Leave Type': log.leave_type,
      'Days': log.total_days,
      'Start Date': log.start_date || '-',
      'End Date': log.end_date || '-',
      'Status': log.status,
      'Performed By': log.performed_by,
      'Role': log.performed_by_role,
      'Timestamp': log.performed_at ? format(new Date(log.performed_at), 'yyyy-MM-dd HH:mm:ss') : '-',
      'Details': log.details
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave Audit Trail')

    worksheet['!cols'] = [
      { wch: 20 }, { wch: 12 }, { wch: 25 }, { wch: 15 },
      { wch: 20 }, { wch: 18 }, { wch: 8 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 25 }, { wch: 12 },
      { wch: 22 }, { wch: 50 }
    ]

    XLSX.writeFile(workbook, `CBI_Leave_Audit_Trail_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`)
    toast.success('Leave Audit Trail exported to Excel!')
  }

  if (!profile || !isAdmin(profile)) return null

  return (
    <div className="space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight flex items-center gap-2">
            <Activity size={24} className="text-[#006939]" />
            Leave Audit Trail
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Complete chronological log of all leave-related actions — submissions, approvals, declines, cancellations, and administrative changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuditLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white text-sm font-bold transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={16} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Total Events', value: logs.length, color: 'text-gray-800' },
            { label: 'Submissions', value: logs.filter(l => l.action_type === 'submit').length, color: 'text-blue-700' },
            { label: 'Approvals', value: logs.filter(l => l.action_type === 'approve').length, color: 'text-emerald-700' },
            { label: 'Declines', value: logs.filter(l => l.action_type === 'decline').length, color: 'text-rose-700' },
            { label: 'Cancellations', value: logs.filter(l => l.action_type === 'cancel').length, color: 'text-gray-600' },
            { label: 'Admin Actions', value: logs.filter(l => l.action_type === 'edit' || l.action_type === 'delete' || l.action_type === 'admin').length, color: 'text-amber-700' }
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{stat.label}</p>
              <p className={`text-2xl font-black mt-0.5 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by employee, action, department..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
            />
          </div>

          {/* Action Type Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#006939] font-medium"
          >
            <option value="all">All Actions</option>
            <option value="submit">Submissions</option>
            <option value="approve">Approvals</option>
            <option value="decline">Declines</option>
            <option value="cancel">Cancellations</option>
            <option value="edit">Admin Edits</option>
            <option value="delete">Admin Deletions</option>
          </select>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#006939] font-medium"
          >
            <option value="all">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>

          {/* Sort Toggle */}
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 hover:bg-gray-100 font-medium transition-all"
            title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortOrder === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span className="hidden sm:inline">{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>

        {filteredLogs.length !== logs.length && (
          <p className="text-xs text-gray-500 mt-2">
            Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> events
          </p>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 size={32} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-semibold">Loading audit trail...</p>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Employee</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-5 py-4">Leave Type</th>
                  <th className="px-5 py-4">Days</th>
                  <th className="px-5 py-4">Performed By</th>
                  <th className="px-5 py-4">Timestamp</th>
                  <th className="px-5 py-4">Details</th>
                  <th className="px-5 py-4 text-center">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredLogs.map((log) => {
                  const badge = getActionBadge(log.action_type)
                  const BadgeIcon = badge.icon
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${badge.bg} ${badge.text}`}>
                          <BadgeIcon size={12} />
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-semibold text-gray-800 text-xs">{log.employee_name}</p>
                          <p className="text-[11px] text-gray-500">{log.employee_id}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 font-medium">{log.department}</td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 font-medium">{log.leave_type}</td>
                      <td className="px-5 py-3.5 text-xs font-bold text-gray-800 text-center">{log.total_days}</td>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-semibold text-gray-800 text-xs">{log.performed_by}</p>
                          <p className="text-[11px] text-gray-500 capitalize">{log.performed_by_role}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} />
                          {log.performed_at
                            ? format(new Date(log.performed_at), 'dd MMM yyyy, HH:mm')
                            : '-'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500 max-w-[200px] truncate" title={log.details}>
                        {log.details || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {log.request_id && (
                          <Link
                            to={`/leave/requests/${log.request_id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-[#006939]/10 text-gray-600 hover:text-[#006939] text-[11px] font-semibold transition-all"
                            title="View request"
                          >
                            <Eye size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-gray-400 gap-3">
            <FileText size={48} className="text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-semibold">No audit records found.</p>
              <p className="text-xs text-gray-400 mt-1">
                {searchTerm || actionFilter !== 'all' || dateRange !== 'all'
                  ? 'Try adjusting your filters or search terms.'
                  : 'Leave actions performed in the system will appear here.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LeaveAuditTrailPage

