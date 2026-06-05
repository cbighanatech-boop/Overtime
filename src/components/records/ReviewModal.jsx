import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { X, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { isAdmin, canDeleteRecord, canReviewRecord } from '../../utils/roleHelpers'


export const ReviewModal = ({ isOpen, onClose, record, onSuccess }) => {
  const { profile } = useAuth()
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset comment when record changes
  useEffect(() => {
    if (record) {
      setComment(record.comment || '')
    }
  }, [record])

  if (!isOpen || !record) return null

  const handleReview = async (newStatus) => {
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('overtime_records')
        .update({
          status: newStatus,
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          comment: comment.trim() || null
        })
        .eq('id', record.id)

      if (error) throw error

      toast.success(`Overtime record successfully ${newStatus.toLowerCase()}!`)
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error("Error submitting review:", err.message)
      toast.error(err.message || "Failed to update record status.")
    } finally {
      setSubmitting(false)
    }
  }

  const isAlreadyReviewed = record.status !== 'Pending';
  const canReview = canReviewRecord(profile, record)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
      ></div>

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-10 animate-scale-up">
        
        {/* Header (Solid Granite Green) */}
        <div className="bg-[#006939] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-[#FDB913]" />
            <h3 className="text-md font-bold uppercase tracking-wider font-sans">
              Review Overtime Entry
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="text-white/80 hover:text-white rounded-full p-1 hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          {/* Admin Override Warning Alert */}
          {isAlreadyReviewed && isAdmin(profile) && (
            <div className="flex gap-3 bg-amber-50 border border-[#FDB913] p-4 rounded-xl text-amber-800 text-sm">
              <AlertTriangle className="h-5 w-5 text-[#FDB913] shrink-0" />
              <div>
                <p className="font-bold">Admin Override Mode</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  This record is currently <strong>{record.status}</strong>. As an Admin, you are overriding the status.
                </p>
              </div>
            </div>
          )}

          {/* Record summary */}
          <div className="bg-[#F3F4F6] rounded-xl p-4 space-y-3 text-sm text-[#1A1A1A]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</span>
                <span className="font-semibold">{record.employee_name}</span>
              </div>
              <div>
                <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Department</span>
                <span className="font-semibold">{record.departments?.name}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Shift Date</span>
                <span className="font-semibold">{record.date}</span>
              </div>
              <div>
                <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Hours Earned</span>
                <span className="font-bold text-[#006939]">{record.overtime_hours} Hrs</span>
              </div>
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Task Accomplished</span>
              <p className="text-xs text-gray-600 mt-1 italic whitespace-pre-line">{record.description}</p>
            </div>
          </div>

          {/* Comment Text Area */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider">
              Review Comments (Optional)
            </label>
            <textarea
              rows="3"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Provide context or explanation for approval/decline action..."
              className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all placeholder-gray-400"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Actions Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors w-full sm:w-auto"
          >
            Cancel
          </button>
          
          {canReview && (
            <button
              type="button"
              onClick={() => handleReview('Declined')}
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] w-full sm:w-auto"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <XCircle size={16} />
                  <span>Decline Entry</span>
                </>
              )}
            </button>
          )}
          {canReview && (
            <button
              type="button"
              onClick={() => handleReview('Approved')}
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] w-full sm:w-auto"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <CheckCircle size={16} />
                  <span>Approve Entry</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReviewModal
