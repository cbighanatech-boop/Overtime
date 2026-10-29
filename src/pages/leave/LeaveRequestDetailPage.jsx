import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { canReviewLeave, canCancelLeave, LEAVE_STATUS_COLORS, getEntitlementBreakdown } from '../../utils/leaveHelpers'
import { 
  ArrowLeft, 
  CalendarDays, 
  User, 
  Building2, 
  Clock, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Phone, 
  Check, 
  X, 
  Trash2,
  Edit2,
  Save,
  ShieldCheck,
  CalendarCheck,
  AlertTriangle,
  Lock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export const LeaveRequestDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [balanceInfo, setBalanceInfo] = useState(null)

  // Review states
  const [reviewDecision, setReviewDecision] = useState('Approved')
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Admin edit/delete states
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const fetchRequest = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          departments (name),
          leave_types (name, default_days, description),
          captured_by_profile:profiles!leave_requests_captured_by_fkey (full_name, role, email),
          reviewed_by_profile:profiles!leave_requests_reviewed_by_fkey (full_name, role, email)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setRequest(data)

      // Calculate entitlement balance & over-limit status
      try {
        const year = new Date(data.start_date).getFullYear()
        const { data: empProfile } = await supabase
          .from('profiles')
          .select('*, departments(name)')
          .or(`id.eq.${data.employee_id},staff_id.eq.${data.employee_id}`)
          .maybeSingle()

        const staffId = empProfile?.staff_id || data.employee_id
        const { data: customBal } = await supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', staffId)
          .eq('leave_type_id', data.leave_type_id)
          .eq('year', year)
          .maybeSingle()

        let entitled = 0
        if (customBal && customBal.entitled_days !== null && customBal.entitled_days !== undefined) {
          entitled = Number(customBal.entitled_days)
        } else if (data.leave_types) {
          const breakdown = getEntitlementBreakdown(empProfile, data.leave_types, year)
          entitled = breakdown.entitled
        }

        const { data: approvedReqs } = await supabase
          .from('leave_requests')
          .select('id, total_days')
          .eq('employee_id', data.employee_id)
          .eq('leave_type_id', data.leave_type_id)
          .eq('status', 'Approved')
          .neq('id', data.id)
          .gte('start_date', `${year}-01-01`)
          .lte('start_date', `${year}-12-31`)

        const approvedDays = (approvedReqs || []).reduce((sum, r) => sum + Number(r.total_days || 0), 0)
        const availableDays = Math.max(0, entitled - approvedDays)
        const exceedsLimit = Number(data.total_days || 0) > availableDays

        setBalanceInfo({
          entitledDays: entitled,
          approvedDays,
          availableDays,
          exceedsLimit
        })
      } catch (balErr) {
        console.warn('Could not compute balance limit:', balErr.message)
      }

    } catch (err) {
      console.error('Fetch request detail error:', err.message)
      toast.error('Could not load leave request details.')
      navigate('/leave/requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequest()
  }, [id])

  const handleReview = async (decision) => {
    if (!request || !canReviewLeave(profile, request)) {
      toast.error('You do not have permission to review this leave request.')
      return
    }

    if (decision === 'Approved' && balanceInfo?.exceedsLimit && !isAdmin(profile)) {
      toast.error('Supervisors cannot approve leave applications that exceed the entitlement limit. Only Administrators can approve.')
      return
    }

    if (decision === 'Declined' && !reviewComment.trim()) {
      toast.error('Please provide a reason for declining the leave application.')
      return
    }

    setSubmittingReview(true)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: decision,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (error) throw error

      toast.success(`Leave request ${decision.toLowerCase()} successfully.`)
      fetchRequest()
    } catch (err) {
      console.error('Review failed:', err.message)
      toast.error(err.message || 'Review submission failed.')
    } finally {
      setSubmittingReview(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!request || !canCancelLeave(profile, request)) return
    if (!window.confirm('Are you sure you want to cancel this pending leave request?')) return

    setCancelling(true)
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'Cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (error) throw error
      toast.success('Leave request cancelled.')
      fetchRequest()
    } catch (err) {
      toast.error(err.message || 'Failed to cancel request.')
    } finally {
      setCancelling(false)
    }
  }

  // ========================
  // Admin Edit/Delete Handlers
  // ========================

  const enterEditMode = () => {
    if (!request) return
    setEditData({
      start_date: request.start_date,
      end_date: request.end_date,
      total_days: request.total_days,
      reason: request.reason || '',
      relief_staff_name: request.relief_staff_name || '',
      contact_phone: request.contact_phone || '',
      handover_notes: request.handover_notes || ''
    })
    setEditMode(true)
  }

  const cancelEditMode = () => {
    setEditMode(false)
    setEditData({})
  }

  const handleSaveEdit = async () => {
    if (!request || !isAdmin(profile)) {
      toast.error('Only administrators can edit approved leave requests.')
      return
    }

    if (!editData.start_date || !editData.end_date || !editData.total_days) {
      toast.error('Start date, end date, and total days are required.')
      return
    }

    if (Number(editData.total_days) <= 0) {
      toast.error('Total days must be greater than 0.')
      return
    }

    setSavingEdit(true)
    try {
      // Log the edit action in the audit trail
      try {
        await supabase.from('leave_audit_logs').insert({
          request_id: request.id,
          action: 'Admin Edit (Approved Request)',
          action_type: 'edit',
          employee_name: request.employee_name,
          employee_id: request.employee_id,
          department: request.departments?.name || '',
          leave_type: request.leave_types?.name || '',
          total_days: request.total_days,
          start_date: request.start_date,
          end_date: request.end_date,
          performed_by: profile.full_name,
          performed_by_role: profile.role,
          performed_at: new Date().toISOString(),
          status: request.status,
          details: `Admin edited approved request: dates changed from ${request.start_date}–${request.end_date} (${request.total_days}d) to ${editData.start_date}–${editData.end_date} (${editData.total_days}d)`
        })
      } catch (auditErr) {
        console.warn('Could not log audit entry:', auditErr.message)
      }

      const { error } = await supabase
        .from('leave_requests')
        .update({
          start_date: editData.start_date,
          end_date: editData.end_date,
          total_days: Number(editData.total_days),
          reason: editData.reason.trim() || null,
          relief_staff_name: editData.relief_staff_name.trim() || null,
          contact_phone: editData.contact_phone.trim() || null,
          handover_notes: editData.handover_notes.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (error) throw error

      toast.success('Leave request updated successfully.')
      setEditMode(false)
      setEditData({})
      fetchRequest()
    } catch (err) {
      console.error('Admin edit failed:', err.message)
      toast.error(err.message || 'Failed to save changes.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleAdminDelete = async () => {
    if (!request || !isAdmin(profile)) {
      toast.error('Only administrators can delete leave requests.')
      return
    }

    setDeleting(true)
    try {
      // Log the deletion in audit trail before deleting
      try {
        await supabase.from('leave_audit_logs').insert({
          request_id: request.id,
          action: 'Admin Delete (Approved Request)',
          action_type: 'delete',
          employee_name: request.employee_name,
          employee_id: request.employee_id,
          department: request.departments?.name || '',
          leave_type: request.leave_types?.name || '',
          total_days: request.total_days,
          start_date: request.start_date,
          end_date: request.end_date,
          performed_by: profile.full_name,
          performed_by_role: profile.role,
          performed_at: new Date().toISOString(),
          status: request.status,
          details: `Admin deleted ${request.status.toLowerCase()} request for ${request.employee_name}: ${request.total_days} day(s) of ${request.leave_types?.name || 'leave'} (${request.start_date} to ${request.end_date}). Reason: ${request.reason || 'N/A'}`
        })
      } catch (auditErr) {
        console.warn('Could not log audit entry:', auditErr.message)
      }

      const { error } = await supabase
        .from('leave_requests')
        .delete()
        .eq('id', request.id)

      if (error) throw error

      toast.success('Leave request deleted successfully.')
      navigate('/leave/requests')
    } catch (err) {
      console.error('Admin delete failed:', err.message)
      toast.error(err.message || 'Failed to delete leave request.')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-sans">
        <Loader2 size={32} className="animate-spin text-[#006939] mx-auto mb-3" />
        <p className="text-sm font-semibold">Loading leave request details...</p>
      </div>
    )
  }

  if (!request) return null

  const statusBadge = LEAVE_STATUS_COLORS[request.status] || LEAVE_STATUS_COLORS.Pending
  const userCanReview = canReviewLeave(profile, request)
  const userCanCancel = canCancelLeave(profile, request)
  const adminCanEditDelete = isAdmin(profile) && request.status === 'Approved'

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/leave/requests')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:text-[#006939] hover:bg-gray-50 text-xs font-bold shadow-sm transition-all"
        >
          <ArrowLeft size={16} />
          <span>Back to All Requests</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Admin Edit/Delete buttons for approved requests */}
          {adminCanEditDelete && !editMode && (
            <>
              <button
                onClick={enterEditMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-all"
                title="Edit this approved leave request"
              >
                <Edit2 size={14} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all"
                title="Delete this approved leave request"
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </>
          )}

          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
            <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`}></span>
            <span>{request.status}</span>
          </span>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 max-w-md w-full mx-4 space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-black uppercase tracking-tight">Confirm Deletion</h3>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              Are you sure you want to <strong>permanently delete</strong> this approved leave request for <strong>{request.employee_name}</strong>?
            </p>
            <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1 text-gray-600 border border-gray-100">
              <p><strong>Leave Type:</strong> {request.leave_types?.name}</p>
              <p><strong>Dates:</strong> {request.start_date} to {request.end_date}</p>
              <p><strong>Duration:</strong> {request.total_days} working day(s)</p>
            </div>
            <p className="text-xs text-rose-600 font-semibold">
              ⚠ This action cannot be undone. The deletion will be recorded in the audit trail.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleAdminDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>Yes, Delete</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs transition-all"
              >
                <X size={14} />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Details Card */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
        {/* Card Banner */}
        <div className="p-6 sm:p-8 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#FDB913]">
                Leave Application Details
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase mt-1">
                {request.employee_name}
              </h1>
              <p className="text-sm text-white/80 mt-1">
                Staff ID: <strong className="text-white">{request.employee_id}</strong> • Department: <strong className="text-white">{request.departments?.name}</strong>
              </p>
            </div>

            <div className="text-right sm:text-right">
              <div className="inline-block p-3 bg-white/10 rounded-2xl text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 block">Duration</span>
                <span className="text-2xl font-black text-[#FDB913] leading-none">
                  {request.total_days}
                </span>
                <span className="text-[10px] text-white/80 block mt-0.5">Working Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="p-6 sm:p-8 space-y-8">

          {/* Admin Edit Mode Banner */}
          {editMode && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Edit2 size={18} className="text-amber-700" />
                <h3 className="text-sm font-black text-amber-800 uppercase tracking-wider">
                  Admin Edit Mode
                </h3>
              </div>
              <p className="text-xs text-amber-700 mb-4">
                Modify the fields below and click "Save Changes" to update this approved leave request. Changes are recorded in the audit trail.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editData.start_date || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="date"
                    value={editData.end_date || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Total Days</label>
                  <input
                    type="number"
                    min="1"
                    value={editData.total_days || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, total_days: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Reason</label>
                  <textarea
                    rows="2"
                    value={editData.reason || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Relief Staff</label>
                  <input
                    type="text"
                    value={editData.relief_staff_name || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, relief_staff_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Emergency Phone</label>
                  <input
                    type="text"
                    value={editData.contact_phone || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Handover Notes</label>
                  <input
                    type="text"
                    value={editData.handover_notes || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, handover_notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-amber-200">
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Save Changes</span>
                </button>
                <button
                  onClick={cancelEditMode}
                  disabled={savingEdit}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs transition-all"
                >
                  <X size={14} />
                  <span>Cancel Edit</span>
                </button>
              </div>
            </div>
          )}
          
          {/* Key Dates & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Leave Category</p>
              <p className="text-base font-extrabold text-[#006939] mt-0.5">
                {request.leave_types?.name || 'General Leave'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {request.leave_types?.default_days || 0} standard days/yr
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Start Date</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">
                {format(parseISO(request.start_date), 'EEEE, dd MMM yyyy')}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">End Date (Inclusive)</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">
                {format(parseISO(request.end_date), 'EEEE, dd MMM yyyy')}
              </p>
            </div>
          </div>

          {/* Details breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Reason & Justification
              </h3>
              <div className="p-4 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 leading-relaxed min-h-[90px]">
                {request.reason}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Coverage & Handover
              </h3>
              <div className="p-4 bg-white border border-gray-200 rounded-xl text-xs space-y-2 text-gray-700 min-h-[90px]">
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-500">Relief / Cover Staff:</span>
                  <strong className="text-gray-900">{request.relief_staff_name || 'None Specified'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-500">Emergency Phone:</span>
                  <strong className="text-gray-900">{request.contact_phone || 'N/A'}</strong>
                </div>
                {request.handover_notes && (
                  <div className="pt-1 text-gray-600 border-t border-gray-100">
                    <span className="font-semibold text-gray-500 block mb-0.5">Notes:</span>
                    <span>{request.handover_notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workflow & Audit trail */}
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
              Audit & Approval Timeline
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Step 1: Capture */}
              <div className="p-4 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#006939]"></div>
                  <span className="text-xs font-extrabold text-[#006939] uppercase">Application Submitted</span>
                </div>
                <p className="text-xs text-gray-800 font-semibold">
                  Captured by: {request.captured_by_profile?.full_name || 'Department Rep'}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Role: <strong className="capitalize">{request.captured_by_profile?.role || 'Rep'}</strong> • {request.captured_at ? format(parseISO(request.captured_at), 'dd MMM yyyy, HH:mm') : ''}
                </p>
              </div>

              {/* Step 2: Review */}
              <div className="p-4 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    request.status === 'Approved' ? 'bg-emerald-500' : request.status === 'Declined' ? 'bg-rose-500' : 'bg-amber-400'
                  }`}></div>
                  <span className="text-xs font-extrabold text-gray-800 uppercase">
                    Supervisor Decision: {request.status}
                  </span>
                </div>
                {request.reviewed_by ? (
                  <>
                    <p className="text-xs text-gray-800 font-semibold">
                      Reviewed by: {request.reviewed_by_profile?.full_name || 'Supervisor'}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Decision on {format(parseISO(request.reviewed_at), 'dd MMM yyyy, HH:mm')}
                    </p>
                    {request.review_comment && (
                      <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-700 italic border border-gray-100">
                        "{request.review_comment}"
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic mt-1">
                    Pending review and decision by department supervisor.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SUPERVISOR / ADMIN ACTION PANEL */}
          {userCanReview && request.status === 'Pending' && (
            <div className="p-6 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border border-emerald-200 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-[#006939]" />
                <h3 className="text-sm font-black text-[#006939] uppercase tracking-wider">
                  Review &amp; Decision Panel
                </h3>
              </div>

              {/* Over-Limit Alert Banner */}
              {balanceInfo?.exceedsLimit && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-900 font-extrabold uppercase tracking-wide">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    <span>Entitlement Limit Exceeded</span>
                  </div>
                  <p className="text-gray-700 leading-relaxed">
                    This request asks for <strong>{request.total_days} days</strong>, but only <strong>{balanceInfo.availableDays} days</strong> remain available in the employee's entitlement (Entitled: {balanceInfo.entitledDays}, Taken: {balanceInfo.approvedDays}).
                  </p>
                  {!isAdmin(profile) ? (
                    <p className="text-rose-700 font-bold flex items-center gap-1 pt-1">
                      <Lock size={13} className="shrink-0" />
                      <span>Department Supervisors cannot approve leave requests that exceed the limit. Only System Administrators have authorization to approve this application.</span>
                    </p>
                  ) : (
                    <p className="text-emerald-800 font-bold pt-1">
                      ✓ Administrator Authorization Active: You have permission to override the limit and approve.
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-600">
                {balanceInfo?.exceedsLimit && !isAdmin(profile)
                  ? 'Because this request exceeds the leave entitlement, you can decline the request with feedback or ask an Administrator to review it.'
                  : 'As a supervisor or administrator, you can review this application. If declining, please provide a justification for the employee and representative.'}
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Reason / Supervisor Comment
                </label>
                <textarea
                  rows="2"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    balanceInfo?.exceedsLimit && !isAdmin(profile)
                      ? 'State the reason for declining this over-limit request...'
                      : 'Explain reason for approval or decline...'
                  }
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#006939]"
                ></textarea>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {balanceInfo?.exceedsLimit && !isAdmin(profile) ? (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 text-gray-400 font-bold text-xs border border-gray-200 cursor-not-allowed shadow-none"
                    title="Supervisors cannot approve over-limit leave applications. Administrator approval required."
                  >
                    <Lock size={14} />
                    <span>Approve (Admin Only)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleReview('Approved')}
                    disabled={submittingReview}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                  >
                    {submittingReview ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>{balanceInfo?.exceedsLimit ? 'Approve (Admin Override)' : 'Approve Leave'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleReview('Declined')}
                  disabled={submittingReview}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {submittingReview ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  <span>Decline Leave</span>
                </button>
              </div>
            </div>
          )}

          {/* Cancel option for Rep if still pending */}
          {userCanCancel && request.status === 'Pending' && !userCanReview && (
            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={cancelling}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all"
              >
                <Trash2 size={14} />
                <span>Cancel This Request</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default LeaveRequestDetailPage
