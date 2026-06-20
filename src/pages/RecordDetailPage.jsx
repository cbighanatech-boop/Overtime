import React, { useState, useEffect } from 'react'

// Bulletproof currency formatter — never throws even if value is null/undefined/NaN
const safeCurrency = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Bulletproof date formatter
const safeDate = (dateStr, fmt) => {
  if (!dateStr) return 'N/A'
  const parsed = parseISO(dateStr)
  if (!isNaN(parsed)) return format(parsed, fmt)
  return String(dateStr)
}

import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { 
  ArrowLeft, 
  Clock, 
  DollarSign, 
  FileText, 
  User, 
  Calendar,
  MessageSquare,
  ShieldCheck,
  Edit,
  CheckSquare,
  CalendarDays
} from 'lucide-react'
import { canEditRecord, canReviewRecord } from '../utils/roleHelpers'
import ReviewModal from '../components/records/ReviewModal'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export const RecordDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  // State Management
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reviewerProfile, setReviewerProfile] = useState(null)

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false)

  const fetchRecordDetails = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('overtime_records')
        .select(`
          *,
          departments (name),
          capturer!inner(full_name)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setRecord(data)

      // Fetch reviewer details if reviewed
      if (data.reviewed_by) {
        const { data: revData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.reviewed_by)
          .single()
        
        if (revData) {
          setReviewerProfile(revData)
        }
      }
    } catch (err) {
      console.error("Error loading record details:", err.message)
      toast.error("Failed to load overtime record details.")
      navigate('/records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecordDetails()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#006939]"></div>
          <p className="text-xs text-gray-500 font-sans font-semibold">Loading record details...</p>
        </div>
      </div>
    )
  }

  if (!record) return null

  // Status Styling Configuration
  const getStatusConfig = (status) => {
    switch (status) {
      case 'Approved':
        return {
          bannerBg: 'bg-[#D1FAE5]',
          border: 'border-[#059669]',
          text: 'text-[#065F46]',
          label: 'Approved'
        }
      case 'Pending':
        return {
          bannerBg: 'bg-[#FEF3C7]',
          border: 'border-[#D97706]',
          text: 'text-[#92400E]',
          label: 'Pending Approval'
        }
      case 'Declined':
        return {
          bannerBg: 'bg-[#FEE2E2]',
          border: 'border-[#DC2626]',
          text: 'text-[#991B1B]',
          label: 'Declined'
        }
      default:
        return {
          bannerBg: 'bg-gray-150',
          border: 'border-gray-250',
          text: 'text-gray-700',
          label: status
        }
    }
  }

  const statusConfig = getStatusConfig(record.status)

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* Header breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/records')}
            className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
              Record Audit Summary
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Unique ID: <span className="font-semibold text-gray-700 font-mono">{record.id.slice(0, 8)}...</span>
            </p>
          </div>
        </div>

        {/* Action Panel */}
        <div className="flex items-center gap-2">
          {canEditRecord(profile, record) && (
            <Link
              to={`/records/${record.id}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Edit size={14} className="text-amber-600" />
              <span>Edit Record</span>
            </Link>
          )}

          {canReviewRecord(profile, record) && (
            <button
              onClick={() => setReviewModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-[0.98]"
            >
              <CheckSquare size={14} />
              <span>Submit Review</span>
            </button>
          )}
        </div>
      </div>

      {/* Main details canvas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden">
        
        {/* Status banner */}
        <div className={`${statusConfig.bannerBg} px-6 py-4.5 border-b ${statusConfig.border} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
          <div className="flex items-center gap-2.5">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${statusConfig.text} border ${statusConfig.border} bg-white/40`}>
              {statusConfig.label}
            </span>
            <span className="text-xs font-semibold text-gray-500">
              Shift Date: <strong>{safeDate(record.work_date, 'MMMM dd, yyyy')}</strong>
            </span>
          </div>
          <div className="text-xs text-gray-500 font-medium">
            Logged by {record.capturer?.full_name || 'N/A'} on {safeDate(record.created_at, 'MMM dd, yyyy')}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          
          {/* Section 1: Split panels - Employee vs Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Employee Profile info block */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-[#006939] uppercase tracking-wider border-b border-gray-150 pb-2 flex items-center gap-1.5">
                <User size={14} />
                <span>Employee Info</span>
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Full Name</span>
                  <span className="font-semibold text-gray-800">{record.profiles?.full_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Email</span>
                  <span className="font-semibold text-gray-700">{record.profiles?.email}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Department</span>
                  <span className="font-bold text-[#006939]">{record.departments?.name}</span>
                </div>
              </div>
            </div>

            {/* Session Parameters & Finances */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-[#006939] uppercase tracking-wider border-b border-gray-150 pb-2 flex items-center gap-1.5">
                <Clock size={14} />
                <span>Shift Metrics</span>
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Time In</span>
                  <span className="font-semibold text-gray-700">{record.time_in}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Time Out</span>
                  <span className="font-semibold text-gray-700">{record.time_out}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Overtime Hours</span>
                  <span className="text-md font-[900] text-[#006939]">{record.overtime_hours} Hrs</span>
                </div>
                <div>
                  {adminView && (
                  <span className="block text-[10px] uppercase font-bold text-gray-400">
                    Rate (Multiplier)
                  </span>
                )}
                {adminView && (
                  <span className="font-semibold text-gray-700">${record.hourly_rate} ({record.rate_multiplier}x)</span>
                )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Est Payout Ribbon */}
          {adminView && (
              <div className="bg-gradient-to-r from-[#004D2A] to-[#006939] p-5 rounded-2xl text-white flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-white/10 rounded-lg text-[#FDB913]"><DollarSign size={18} /></div>
                  <span className="text-xs uppercase tracking-wider font-bold">Estimated Session Payout</span>
                </div>
                <span className="text-2xl font-[900] text-[#FDB913]">
                  GH₵{safeCurrency(record?.estimated_payout)}
                </span>
              </div>
            )}

          {/* Section 3: Tasks Accomplished */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#006939] uppercase tracking-wider border-b border-gray-150 pb-2 flex items-center gap-1.5">
              <FileText size={14} />
              <span>Logged Task Descriptions</span>
            </h3>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 leading-relaxed font-sans whitespace-pre-wrap">
              {record.description}
            </div>
          </div>

          {/* Section 4: Audit trail and comments */}
          {record.status !== 'Pending' && (
            <div className="space-y-3.5 border-t border-gray-100 pt-6">
              <h3 className="text-xs font-bold text-[#006939] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={14} />
                <span>Supervisor Audit Trail</span>
              </h3>
              
              <div className="bg-amber-50/40 border border-amber-200/60 p-4 rounded-xl space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 gap-2 font-medium">
                  <div>
                    Reviewed By: <strong className="text-gray-800">{reviewerProfile?.full_name || 'System Auditor'}</strong>
                  </div>
                  <div>
                    Decision Date: <strong>{record.reviewed_at ? safeDate(record.reviewed_at, 'MMM dd, yyyy hh:mm a') : 'N/A'}</strong>
                  </div>
                </div>

                {record.comments && (
                  <div className="space-y-1.5">
                    <span className="block text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                      <MessageSquare size={10} /> Reviewer Comments
                    </span>
                    <blockquote className="text-sm italic text-gray-700 border-l-2 border-[#006939] pl-3 py-0.5">
                      "{record.comments}"
                    </blockquote>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal portal binding */}
      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        record={record}
        onSuccess={fetchRecordDetails}
      />
    </div>
  )
}

export default RecordDetailPage
