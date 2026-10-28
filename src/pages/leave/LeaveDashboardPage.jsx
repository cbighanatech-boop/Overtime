import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { canApplyLeave, canReviewLeave, LEAVE_STATUS_COLORS } from '../../utils/leaveHelpers'
import { 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  PlusCircle, 
  Users, 
  ArrowRight, 
  CalendarRange, 
  Layers, 
  TrendingUp, 
  Activity,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  X,
  UserCheck
} from 'lucide-react'
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts'
import toast from 'react-hot-toast'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'

const LEAVE_COLORS = ['#006939', '#FDB913', '#34D399', '#60A5FA', '#A78BFA', '#F87171', '#FB923C']

export const LeaveDashboardPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [metrics, setMetrics] = useState({
    pendingCount: 0,
    approvedThisMonth: 0,
    approvedDaysThisMonth: 0,
    activeOnLeaveToday: 0,
    totalAnnualTakenDays: 0
  })

  const [activeStaffOnLeave, setActiveStaffOnLeave] = useState([])
  const [typeDistribution, setTypeDistribution] = useState([])

  const fetchDashboardData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd')
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

      // 1. Fetch leave types
      const { data: ltData } = await supabase.from('leave_types').select('*').order('name')
      const types = ltData || []
      setLeaveTypes(types)

      // 2. Fetch leave requests for current department / all
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          departments (name),
          leave_types (name, default_days),
          captured_by_profile:profiles!leave_requests_captured_by_fkey (full_name),
          reviewed_by_profile:profiles!leave_requests_reviewed_by_fkey (full_name)
        `)
        .order('captured_at', { ascending: false })

      if (!isAdmin(profile) && profile.department_id) {
        query = query.eq('department_id', profile.department_id)
      }

      const { data: reqData, error: reqError } = await query
      if (reqError) throw reqError

      const allReqs = reqData || []
      setRequests(allReqs)

      // Compute metrics
      let pending = 0
      let monthApprovedCount = 0
      let monthApprovedDays = 0
      let onLeaveTodayList = []
      let totalAnnualDays = 0
      const typeCountMap = {}

      allReqs.forEach(r => {
        const totalDays = Number(r.total_days || 0)
        const typeName = r.leave_types?.name || 'Other'

        if (r.status === 'Pending') {
          pending++
        }

        if (r.status === 'Approved') {
          totalAnnualDays += totalDays

          // Monthly check
          if (r.start_date >= monthStart && r.start_date <= monthEnd) {
            monthApprovedCount++
            monthApprovedDays += totalDays
          }

          // Currently on leave today check
          if (r.start_date <= todayStr && r.end_date >= todayStr) {
            onLeaveTodayList.push(r)
          }

          // Distribution map
          typeCountMap[typeName] = (typeCountMap[typeName] || 0) + totalDays
        }
      })

      setMetrics({
        pendingCount: pending,
        approvedThisMonth: monthApprovedCount,
        approvedDaysThisMonth: monthApprovedDays,
        activeOnLeaveToday: onLeaveTodayList.length,
        totalAnnualTakenDays: totalAnnualDays
      })

      setActiveStaffOnLeave(onLeaveTodayList)

      // Format chart distribution
      const dist = Object.keys(typeCountMap).map((name, index) => ({
        name,
        days: typeCountMap[name],
        color: LEAVE_COLORS[index % LEAVE_COLORS.length]
      }))
      setTypeDistribution(dist)

    } catch (err) {
      console.error('Leave dashboard fetch error:', err.message)
      toast.error('Could not load leave dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()

    const channel = supabase
      .channel('realtime-leave-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  return (
    <div className="space-y-8 font-sans">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1A1A1A] tracking-tight uppercase">
            CBI Leave Portal
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Departmental overview for leave planning, availability, and supervisor approvals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchDashboardData}
            className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 shadow-sm transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <Link
            to="/leave/calendar"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold text-xs shadow-sm transition-all"
          >
            <CalendarRange size={16} className="text-[#006939]" />
            <span>Calendar</span>
          </Link>

          {canApplyLeave(profile) && (
            <Link
              to="/leave/requests/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all active:scale-[0.98]"
            >
              <PlusCircle size={16} />
              <span>Apply for Leave</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Pending Approvals */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full blur-2xl pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Pending Decisions
              </span>
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                <Clock size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 mt-1">{metrics.pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">
              Awaiting supervisor or admin action
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-gray-100">
            <Link 
              to="/leave/requests"
              className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              <span>Review applications</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* 2. On Leave Today */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Away Today
              </span>
              <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
                <Users size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 mt-1">{metrics.activeOnLeaveToday}</p>
            <p className="text-xs text-gray-500 mt-1">
              Staff currently on approved leave
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-gray-100">
            <Link 
              to="/leave/calendar"
              className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View daily schedule</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* 3. Approved This Month */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#006939]">
                Approved This Month
              </span>
              <div className="p-2 rounded-xl bg-emerald-100 text-[#006939]">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-[#006939] mt-1">{metrics.approvedDaysThisMonth}</p>
            <p className="text-xs text-gray-500 mt-1">
              Working days across {metrics.approvedThisMonth} requests
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400 font-semibold">
              Month of {format(new Date(), 'MMMM yyyy')}
            </span>
          </div>
        </div>

        {/* 4. Total YTD Days Taken */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full blur-2xl pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Annual Taken Days
              </span>
              <div className="p-2 rounded-xl bg-gray-100 text-gray-800">
                <Layers size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 mt-1">{metrics.totalAnnualTakenDays}</p>
            <p className="text-xs text-gray-500 mt-1">
              Total approved days taken this year
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-gray-100">
            <Link 
              to="/leave/balances"
              className="text-xs font-bold text-[#006939] hover:underline flex items-center gap-1"
            >
              <span>Inspect staff balances</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

      </div>

      {/* Middle Section: Currently on Leave Today & Distribution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Currently On Leave Today Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#006939] flex items-center gap-2">
                <UserCheck size={18} />
                <span>On Leave Today ({activeStaffOnLeave.length})</span>
              </h3>
              <span className="text-xs text-gray-400 font-semibold">
                {format(new Date(), 'dd MMM yyyy')}
              </span>
            </div>

            {activeStaffOnLeave.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400 opacity-60" />
                <p className="text-xs font-bold text-gray-600">Full Staff Presence</p>
                <p className="text-[11px] text-gray-400 mt-0.5">No employees on leave today in this department.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {activeStaffOnLeave.map(req => (
                  <div key={req.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900">{req.employee_name}</p>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        {req.leave_types?.name} • Returns {format(parseISO(req.end_date), 'dd MMM')}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                      Away
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100 text-center">
            <Link
              to="/leave/calendar"
              className="text-xs font-bold text-[#006939] hover:underline"
            >
              Open Complete Roster Calendar →
            </Link>
          </div>
        </div>

        {/* Leave Category Distribution Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#006939]">
              Days Taken by Leave Category
            </h3>
            <span className="text-xs text-gray-400 font-semibold">Year {new Date().getFullYear()}</span>
          </div>

          {typeDistribution.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-xs">
              No approved leaves recorded yet to generate charts.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(val) => [`${val} working days`, 'Approved Days']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                  />
                  <Bar dataKey="days" radius={[6, 6, 0, 0]}>
                    {typeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

      {/* Recent Applications Section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-base text-gray-900 uppercase tracking-tight">
            Recent Leave Applications
          </h3>
          <Link
            to="/leave/requests"
            className="text-xs font-bold text-[#006939] hover:underline flex items-center gap-1"
          >
            <span>View All Applications</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            No leave requests recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-5">Employee</th>
                  <th className="py-3 px-5">Leave Category</th>
                  <th className="py-3 px-5">Dates</th>
                  <th className="py-3 px-5">Duration</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.slice(0, 6).map(req => {
                  const statusBadge = LEAVE_STATUS_COLORS[req.status] || LEAVE_STATUS_COLORS.Pending
                  return (
                    <tr key={req.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-5 font-bold text-gray-900">
                        {req.employee_name}
                      </td>
                      <td className="py-3.5 px-5 text-gray-700 font-semibold">
                        {req.leave_types?.name}
                      </td>
                      <td className="py-3.5 px-5 text-gray-600">
                        {format(parseISO(req.start_date), 'dd MMM')} – {format(parseISO(req.end_date), 'dd MMM yyyy')}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="font-bold text-[#006939]">
                          {req.total_days} days
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
                          <span>{req.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          to={`/leave/requests/${req.id}`}
                          className="inline-flex items-center gap-1 text-[#006939] font-bold hover:underline"
                        >
                          <span>Review</span>
                          <ArrowRight size={12} />
                        </Link>
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

export default LeaveDashboardPage

