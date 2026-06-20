import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { X, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export const BulkReviewModal = ({ isOpen, onClose, selectedRecordIds, actionType, onSuccess }) => {
  const { profile } = useAuth()
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset comment when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setComment('')
    }
  }, [isOpen])

  if (!isOpen || !selectedRecordIds || selectedRecordIds.length === 0) return null

  const handleBulkReview = async () => {
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('overtime_records')
        .update({
          status: actionType,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          comments: comment.trim() || null
        })
        .in('id', selectedRecordIds)

      if (error) throw error

      toast.success(`Successfully ${actionType.toLowerCase()} ${selectedRecordIds.length} overtime records!`)
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error("Error submitting bulk review:", err.message)
      toast.error(err.message || "Failed to batch update records.")
    } finally {
      setSubmitting(false)
    }
  }

  const isApprove = actionType === 'Approved'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
      ></div>

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-10 animate-scale-up">
        
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between text-white ${isApprove ? 'bg-[#006939]' : 'bg-red-800'}`}>
          <div className="flex items-center gap-2">
            {isApprove ? (
              <CheckCircle size={20} className="text-[#FDB913]" />
            ) : (
              <XCircle size={20} className="text-white" />
            )}
            <h3 className="text-md font-bold uppercase tracking-wider font-sans">
              Bulk Overtime Evaluation
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
          {/* Main Info Box */}
          <div className={`flex gap-3 p-4 rounded-xl text-sm ${isApprove ? 'bg-[#E8F5EE] border border-[#006939]/20 text-[#004D2A]' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            <AlertTriangle className={`h-5 w-5 shrink-0 ${isApprove ? 'text-[#006939]' : 'text-red-700'}`} />
            <div>
              <p className="font-bold">Review Action Confirmation</p>
              <p className="mt-0.5 text-xs">
                You are about to bulk-evaluate <strong>{selectedRecordIds.length}</strong> selected records. This will mark all of them as <strong className="uppercase">{actionType}</strong>.
              </p>
            </div>
          </div>

          {/* Comment Text Area */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider">
              Bulk Review Comments (Optional)
            </label>
            <textarea
              rows="3"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={`Provide optional comments to apply to all ${selectedRecordIds.length} records...`}
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
          
          <button
            type="button"
            onClick={handleBulkReview}
            disabled={submitting}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] w-full sm:w-auto ${
              isApprove ? 'bg-[#006939] hover:bg-[#004D2A]' : 'bg-red-800 hover:bg-red-700'
            }`}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                {isApprove ? <CheckCircle size={16} /> : <XCircle size={16} />}
                <span>Confirm Bulk {actionType}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BulkReviewModal
