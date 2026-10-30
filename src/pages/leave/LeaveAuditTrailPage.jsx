import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin } from '../../utils/roleHelpers'
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
  Eye,
  Lock,
  DollarSign,
  UploadCloud,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { format, parseISO, subDays } from 'date-fns'

/**
 * Leave Audit Trail Page — Admin only.
 * Captures all activities done on this app:
 * - Submissions
 * - Approvals & Declines
 * - Cancellations
 * - Admin Edits on Approved Leaves
 * - Admin Deletions on Approved Leaves
 * - Hourly Rate Updates (from Overtime App / Dossier)
 * - Batch Balances Uploads
 *
 * Immutable: cannot be edited or modified by any user or administrator.
 */
export const LeaveAuditTrailPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all') // all, 7, 30, 90, 365
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
    const auditEntries = []

    try {
      // ── Step 1: Query Dedicated Immutable leave_audit_logs Table ───────────
      let directLogs = []
      try {
        const { data: logsData, error: logErr } = await supabase
          .from('leave_audit_logs')
          .select('*')
          .order('performed_at', { ascending: false })

        if (logErr) {
          console.warn('Warning querying leave_audit_logs:', logErr.message)
        } else if (logsData) {
          directLogs = logsData.map(log => ({
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
          }))
        }
      } catch (directErr) {
        console.warn('Direct audit log fetch error:', directErr)
      }

      auditEntries.push(...directLogs)

      // Set of unique keys already covered by direct logs to avoid duplicates
      const loggedKeys = new Set()
      directLogs.forEach(l => {
        if (l.request_id && l.action_type) {
          loggedKeys.add(`${l.request_id}-${l.action_type}`)
        }
      })

      // ── Step 2: Safe Historical Fallback from leave_requests ────────────────
      // Synthesize events for requests created before the audit logs table existed
      try {
        const { data: requests, error: reqErr } = await supabase
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
            updated_at,
            created_at,
            departments (name),
            leave_types (name)
          `)
          .order('captured_at', { ascending: false })

        if (!reqErr && requests) {
          // Fetch profiles in separate query to prevent relational schema mismatches
          const { data: profilesList } = await supabase
            .from('profiles')
            .select('id, full_name, role, staff_id')

          const profileMap = new Map()
          ;(profilesList || []).forEach(p => {
            profileMap.set(p.id, p)
            if (p.staff_id) profileMap.set(p.staff_id, p)
          })

          for (const req of requests) {
            const capturer = profileMap.get(req.captured_by)
            const reviewer = profileMap.get(req.reviewed_by)
            const deptName = req.departments?.name || '-'
            const typeName = req.leave_types?.name || '-'

            // 1. Submission event
            if (req.captured_at && !loggedKeys.has(`${req.id}-submit`)) {
              auditEntries.push({
                id: `${req.id}-submit`,
                request_id: req.id,
                action: 'Leave Submitted',
                action_type: 'submit',
                employee_name: req.employee_name,
                employee_id: req.employee_id,
                department: deptName,
                leave_type: typeName,
                total_days: req.total_days,
                start_date: req.start_date,
                end_date: req.end_date,
                performed_by: capturer?.full_name || 'Representative',
                performed_by_role: capturer?.role || 'rep',
                performed_at: req.captured_at,
                status: 'Pending',
                details: `Applied for ${req.total_days} day(s) of ${typeName} (${req.start_date} to ${req.end_date}). Reason: ${req.reason || 'N/A'}`
              })
            }

            // 2. Review event (approval / decline)
            if (req.reviewed_at && (req.status === 'Approved' || req.status === 'Declined')) {
              const actType = req.status === 'Approved' ? 'approve' : 'decline'
              if (!loggedKeys.has(`${req.id}-${actType}`)) {
                auditEntries.push({
                  id: `${req.id}-review`,
                  request_id: req.id,
                  action: req.status === 'Approved' ? 'Leave Approved' : 'Leave Declined',
                  action_type: actType,
                  employee_name: req.employee_name,
                  employee_id: req.employee_id,
                  department: deptName,
                  leave_type: typeName,
                  total_days: req.total_days,
                  start_date: req.start_date,
                  end_date: req.end_date,
                  performed_by: reviewer?.full_name || 'Supervisor',
                  performed_by_role: reviewer?.role || 'supervisor',
                  performed_at: req.reviewed_at,
                  status: req.status,
                  details: req.review_comment
                    ? `${req.status} with comment: "${req.review_comment}"`
                    : `${req.status} — ${req.total_days} day(s) of ${typeName}`
                })
              }
            }

            // 3. Cancellation event
            if (req.status === 'Cancelled' && !loggedKeys.has(`${req.id}-cancel`)) {
              auditEntries.push({
                id: `${req.id}-cancel`,
                request_id: req.id,
                action: 'Leave Cancelled',
                action_type: 'cancel',
                employee_name: req.employee_name,
                employee_id: req.employee_id,
                department: deptName,
                leave_type: typeName,
                total_days: req.total_days,
                start_date: req.start_date,
                end_date: req.end_date,
                performed_by: capturer?.full_name || 'User',
                performed_by_role: capturer?.role || '-',
                performed_at: req.updated_at || req.captured_at,
                status: 'Cancelled',
                details: `Cancelled — ${req.total_days} day(s) of ${typeName}`
              })
            }
          }
        }
      } catch (histErr) {
        console.warn('Historical requests synthesis error:', histErr)
      }

      // Sort all entries by performed_at descending
      auditEntries.sort((a, b) => new Date(b.performed_at || 0) - new Date(a.performed_at || 0))
      setLogs(auditEntries)
    } catch (err) {
      console.error('Audit trail load exception:', err)
      toast.error('Notice: Could not load some audit events.')
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
      const days = parseInt(dateRange, 10)
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
      result.sort((a, b) => new Date(a.performed_at || 0) - new Date(b.performed_at || 0))
    } else {
      result.sort((a, b) => new Date(b.performed_at || 0) - new Date(a.performed_at || 0))
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
      case 'rate':
        return { icon: DollarSign, bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500' }
      case 'upload':
        return { icon: UploadCloud, bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' }
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
      'Staff ID': log.employee_id,
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
      { wch: 22 }, { wch: 14 }, { wch: 25 }, { wch: 15 },
      { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 25 }, { wch: 14 },
      { wch: 22 }, { wch: 60 }
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase flex items-center gap-2">
              <Activity size={24} className="text-[#006939]" />
              Leave Audit Trail
            </h1>
            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
              Admin Portal
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Complete chronological audit log of all activities done on the Leave App — by whom, when, and what was done.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuditLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white text-xs font-bold transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={15} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Immutable Security Notice Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0 shadow-sm">
            <Lock size={18} />
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#006939] uppercase tracking-wide">
              🔒 Immutable System Audit Record
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              This log is an append-only, tamper-proof record of every leave action performed. In accordance with compliance standards, <strong>audit records cannot be modified or deleted</strong>.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-white px-3 py-1 rounded-full border border-emerald-200 shadow-xs shrink-0">
          <ShieldCheck size={14} className="text-[#006939]" />
          Verified Secure
        </span>
      </div>

      {/* Summary KPI Counters */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          {[
            { label: 'All Events', value: logs.length, color: 'text-gray-900', bg: 'bg-white' },
            { label: 'Submissions', value: logs.filter(l => l.action_type === 'submit').length, color: 'text-blue-700', bg: 'bg-white' },
            { label: 'Approvals', value: logs.filter(l => l.action_type === 'approve').length, color: 'text-emerald-700', bg: 'bg-white' },
            { label: 'Declines', value: logs.filter(l => l.action_type === 'decline').length, color: 'text-rose-700', bg: 'bg-white' },
            { label: 'Cancellations', value: logs.filter(l => l.action_type === 'cancel').length, color: 'text-gray-600', bg: 'bg-white' },
            { label: 'Admin Edits', value: logs.filter(l => l.action_type === 'edit').length, color: 'text-amber-700', bg: 'bg-white' },
            { label: 'Admin Deletions', value: logs.filter(l => l.action_type === 'delete').length, color: 'text-red-700', bg: 'bg-white' },
            { label: 'Rates & Uploads', value: logs.filter(l => l.action_type === 'rate' || l.action_type === 'upload').length, color: 'text-indigo-700', bg: 'bg-white' }
          ].map((stat) => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl border border-gray-200 p-3 text-center shadow-xs`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{stat.label}</p>
              <p className={`text-xl sm:text-2xl font-black mt-0.5 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by employee, staff ID, performer, department, action, or details..."
              className="w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
            />
          </div>

          {/* Action Type Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            <option value="all">All Action Types</option>
            <option value="submit">Submissions</option>
            <option value="approve">Approvals</option>
            <option value="decline">Declines</option>
            <option value="cancel">Cancellations</option>
            <option value="edit">Admin Edits</option>
            <option value="delete">Admin Deletions</option>
            <option value="rate">Hourly Rate Updates</option>
            <option value="upload">Batch Uploads</option>
          </select>

          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            <option value="all">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">Last 365 Days</option>
          </select>

          {/* Sort Order Toggle */}
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs font-bold bg-gray-50 hover:bg-gray-100 transition-all shrink-0"
            title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortOrder === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </button>
        </div>

        {filteredLogs.length !== logs.length && (
          <p className="text-xs text-gray-500 mt-2.5 font-medium">
            Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> recorded audit events
          </p>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-500">
            <Loader2 size={36} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-700">Loading audit trail records...</p>
            <p className="text-xs text-gray-400 mt-1">Fetching append-only activity ledger from secure storage.</p>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="bg-gray-50/80 text-gray-700 border-b border-gray-200 text-xs font-extrabold uppercase tracking-wider">
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Employee</th>
                  <th className="px-5 py-4">Dept / Type</th>
                  <th className="px-5 py-4 text-center">Days</th>
                  <th className="px-5 py-4">Performed By</th>
                  <th className="px-5 py-4">Timestamp</th>
                  <th className="px-5 py-4">Details &amp; Audit Log</th>
                  <th className="px-5 py-4 text-center">Request</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredLogs.map((log) => {
                  const badge = getActionBadge(log.action_type)
                  const BadgeIcon = badge.icon
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Action */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${badge.bg} ${badge.text}`}>
                          <BadgeIcon size={12} />
                          {log.action}
                        </span>
                      </td>

                      {/* Employee */}
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{log.employee_name || 'System / Bulk'}</p>
                          <p className="text-[11px] font-mono text-gray-400">{log.employee_id || 'N/A'}</p>
                        </div>
                      </td>

                      {/* Dept / Category */}
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-semibold text-gray-800">{log.department || '-'}</p>
                        <p className="text-[11px] text-gray-500">{log.leave_type || '-'}</p>
                      </td>

                      {/* Days */}
                      <td className="px-5 py-3.5 text-center">
                        {log.total_days ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-gray-100 text-gray-800 font-extrabold text-xs">
                            {log.total_days}d
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Performed By & Role */}
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{log.performed_by}</p>
                          <span className="inline-block text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.2 rounded capitalize mt-0.5">
                            {log.performed_by_role || 'user'}
                          </span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-3.5 text-xs text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-gray-400" />
                          <span>
                            {log.performed_at
                              ? format(new Date(log.performed_at), 'dd MMM yyyy, HH:mm')
                              : '-'}
                          </span>
                        </div>
                      </td>

                      {/* Details */}
                      <td className="px-5 py-3.5 text-xs text-gray-600 max-w-[280px]">
                        <p className="leading-snug" title={log.details}>
                          {log.details || '-'}
                        </p>
                      </td>

                      {/* Request Link */}
                      <td className="px-5 py-3.5 text-center">
                        {log.request_id && log.action_type !== 'delete' ? (
                          <Link
                            to={`/leave/requests/${log.request_id}`}
                            className="inline-flex items-center gap-1 p-1.5 rounded-lg bg-gray-100 hover:bg-[#006939]/10 text-gray-600 hover:text-[#006939] transition-all"
                            title="View request details"
                          >
                            <Eye size={14} />
                          </Link>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
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
              <p className="text-sm font-bold text-gray-700">No audit records found.</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                {searchTerm || actionFilter !== 'all' || dateRange !== 'all'
                  ? 'No events match your current filter settings. Try clearing search or resetting filters.'
                  : 'All future applications, approvals, edits, and deletions will be automatically logged here.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LeaveAuditTrailPage
