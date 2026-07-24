import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'
import { 
  TrendingUp, 
  Users, 
  Clock, 
  DollarSign, 
  FileCheck,
  PlusCircle, 
  BarChart2,
  ArrowUpRight,
  FolderOpen,
  Activity,
  Award,
  Sigma,
  CalendarDays,
  Tag,
  ShieldBan,
  Trash2,
  Loader2
} from 'lucide-react'
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns'
import { isAdmin, isRep, isSupervisor, canEditRecord, canReviewRecord, isReviewTimedOut } from '../utils/roleHelpers'

// Safe tick formatter — prevents Recharts calling toLocaleString() on undefined
const safeTick = (value) => (value === undefined || value === null ? '' : String(value))

// Format currency with thousand separator and decimal
const formatCurrency = (value, decimals = 2) => {
  if (value === undefined || value === null) return `GHS 0.00`
  return `GHS ${Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

// Format number with thousand separator and decimal
const formatNumber = (value, decimals = 2) => {
  if (value === undefined || value === null) return `0.${'0'.repeat(decimals)}`
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// Get date range based on filter
const getDateRange = (filter, customRange) => {
  const today = new Date()
  let startDate, endDate = endOfDay(today)
  
  switch (filter) {
    case 'month':
      startDate = startOfDay(startOfMonth(today))
      break
    case 'quarter':
      startDate = startOfDay(subMonths(today, 3))
      break
    case 'custom':
      startDate = new Date(customRange.startDate)
      endDate = new Date(customRange.endDate)
      break
    case 'all':
    default:
      startDate = new Date('1970-01-01')
      endDate = new Date('2099-12-31')
      break
  }
  
  return { startDate: format(startDate, 'yyyy-MM-dd'), endDate: format(endDate, 'yyyy-MM-dd') }
}

// Tooltip components defined OUTSIDE the page component to prevent remount crashes
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#A9AEB1] p-3 rounded-lg shadow-md font-sans">
        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</p>
        <p className="text-sm font-extrabold text-[#006939] mt-1">
          Overtime: <span className="text-[#FDB913]">{payload[0]?.value}</span> Hrs
        </p>
      </div>
    )
  }
  return null
}

const ReasonTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-md font-sans text-xs">
        <p className="font-bold text-gray-700">{payload[0]?.payload?.name}</p>
        <p className="text-[#006939] font-extrabold mt-0.5">{payload[0]?.value} records</p>
      </div>
    )
  }
  return null
}

// Color theme
const GREEN_SHADES = ['#006939', '#34D399', '#FDB913', '#60A5FA', '#A78BFA', '#F87171']
const STATUS_COLORS = { Approved: '#10B981', Pending: '#FDB913', Declined: '#EF4444' }
const REASON_COLORS = {
  'Holiday': '#006939',
  'Replacement': '#FDB913',
  'Normal Routine Schedule': '#34D399',
  'PM': '#60A5FA',
  'Others': '#A78BFA'
}

export const DashboardPage = () => {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    totalHours: 0,
    employeeCount: 0,
    pendingCount: 0,
    estimatedPayout: 0,
    capturedCount: 0,
    myHours: 0,
    avgHours: 0,
    highestHours: 0,
    highestEmployee: ''
  })
  const [chartData, setChartData] = useState([])
  const [monthChartData, setMonthChartData] = useState([])
  const [deptData, setDeptData] = useState([])
  const [statusData, setStatusData] = useState([])
  const [reasonData, setReasonData] = useState([])
  const [trendView, setTrendView] = useState('day') // 'day' | 'month'
  const [reasonCostData, setReasonCostData] = useState([])
  const [deptCostData, setDeptCostData] = useState([])
  
  // Date filter state
  const [dateFilter, setDateFilter] = useState('all') // 'all' | 'month' | 'quarter' | 'custom'
  const [customDateRange, setCustomDateRange] = useState({
    startDate: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  })
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockCompany, setBlockCompany] = useState('')
  const [blockDepartmentId, setBlockDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [timedOutRecords, setTimedOutRecords] = useState([])
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [activeBlocks, setActiveBlocks] = useState([])
  const [loadingBlocks, setLoadingBlocks] = useState(false)
  const [deletingBlockId, setDeletingBlockId] = useState(null)

  // Fetch existing block windows
  const fetchBlocks = async () => {
    if (!isAdmin(profile)) return
    setLoadingBlocks(true)
    try {
      const { data, error } = await supabase
        .from('admin_entry_blocks')
        .select('*, departments(name)')
        .order('start_at', { ascending: false })
      if (error) throw error
      setActiveBlocks(data || [])
    } catch (err) {
      console.error('Failed to load blocks:', err.message)
    } finally {
      setLoadingBlocks(false)
    }
  }

  const fetchDepartments = async () => {
    if (!isAdmin(profile)) return
    const { data } = await supabase.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  const fetchTimedOutRecords = async () => {
    if (!isAdmin(profile)) return
    setLoadingTimedOut(true)
    try {
      // Find pending records that have a review deadline in the past
      const { data, error } = await supabase
        .from('overtime_records')
        .select(`*, departments(name)`)
        .eq('status', 'Pending')
        .lt('review_deadline', new Date().toISOString())
        .order('work_date', { ascending: false })
      
      // Also fallback for old records without a review_deadline: 
      // where captured_at < now() - 5 days
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('overtime_records')
        .select(`*, departments(name)`)
        .eq('status', 'Pending')
        .is('review_deadline', null)
        .lt('captured_at', fiveDaysAgo)
        .order('work_date', { ascending: false })

      if (error || fallbackError) throw error || fallbackError
      
      const combined = [...(data || []), ...(fallbackData || [])]
      // deduplicate by id
      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values())
      setTimedOutRecords(unique)
    } catch (err) {
      console.error('Failed to load timed out records:', err.message)
    } finally {
      setLoadingTimedOut(false)
    }
  }

  const handleGrantExtension = async (recordId) => {
    if (!isAdmin(profile)) return
    try {
      // Grant +7 days from now
      const newDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase
        .from('overtime_records')
        .update({ review_deadline: newDeadline })
        .eq('id', recordId)
      
      if (error) throw error
      toast.success('7-day extension granted successfully.')
      await fetchTimedOutRecords()
    } catch (err) {
      console.error('Extension failed:', err.message)
      toast.error(err.message || 'Failed to grant extension.')
    }
  }

  const handleBlockEntries = async (e) => {
    e.preventDefault()
    if (!isAdmin(profile)) return
    if (!blockStart || !blockEnd) {
      toast.error('Please choose both start and end dates and times.')
      return
    }
    if (new Date(blockEnd) <= new Date(blockStart)) {
      toast.error('End date/time must be after start date/time.')
      return
    }

    setBlocking(true)
    try {
      const payload = {
        start_at: blockStart,
        end_at: blockEnd,
        reason: blockReason.trim() || 'Admin block',
        created_by: profile.id,
      }
      if (blockCompany) payload.company = blockCompany
      if (blockDepartmentId) payload.department_id = blockDepartmentId

      const { error } = await supabase.from('admin_entry_blocks').insert(payload)

      if (error) throw error

      toast.success('Entry blocking window saved successfully.')
      setBlockStart('')
      setBlockEnd('')
      setBlockReason('')
      setBlockCompany('')
      setBlockDepartmentId('')
      await fetchBlocks()
    } catch (err) {
      console.error('Failed to create block:', err.message)
      toast.error(err.message || 'Failed to save blocking window.')
    } finally {
      setBlocking(false)
    }
  }

  const handleDeleteBlock = async (blockId) => {
    if (!isAdmin(profile)) return
    setDeletingBlockId(blockId)
    try {
      const { error } = await supabase
        .from('admin_entry_blocks')
        .delete()
        .eq('id', blockId)
      if (error) throw error
      toast.success('Block window removed.')
      await fetchBlocks()
    } catch (err) {
      console.error('Delete block failed:', err.message)
      toast.error(err.message || 'Failed to remove block window.')
    } finally {
      setDeletingBlockId(null)
    }
  }

  // Helper to determine block status
  const getBlockStatus = (block) => {
    const now = new Date()
    const start = new Date(block.start_at)
    const end = new Date(block.end_at)
    if (now >= start && now <= end) return 'active'
    if (now < start) return 'upcoming'
    return 'expired'
  }

  const loadDashboardData = async () => {
    if (!profile) return
    setLoading(true)
    try {
      // 1. Employee count
      let employeeQuery = supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      if (!isAdmin(profile)) {
        employeeQuery = employeeQuery.eq('department_id', profile.department_id)
      }
      const { count: empCount } = await employeeQuery

      // 2. Overtime records
      const { startDate, endDate } = getDateRange(dateFilter, customDateRange)
      
      let recordsQuery = supabase
        .from('overtime_records')
        .select(`
          *,
          departments (name)
        `)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
      if (!isAdmin(profile)) {
        recordsQuery = recordsQuery.eq('department_id', profile.department_id)
      }
      const { data: records, error: recordsErr } = await recordsQuery
      if (recordsErr) throw recordsErr

      // Aggregate metrics
      let totalHours = 0
      let estimatedPayout = 0
      let pendingCount = 0
      let myHours = 0
      let capturedCount = 0
      let highestHours = 0
      let highestEmployee = ''

      const deptHoursMap = {}
      const deptCostMap = {}
      const statusHoursMap = { Approved: 0, Pending: 0, Declined: 0 }
      const reasonCountMap = {}
      const reasonCostMap = {}
      const trendDayMap = {}
      const trendMonthMap = {}

      if (records) {
        records.forEach(rec => {
          const hours = Number(rec.overtime_hours || 0)
          const payout = Number(rec.estimated_payout || 0)

          totalHours += hours
          estimatedPayout += payout
          if (rec.status === 'Pending') pendingCount++

          // Highest overtime record
          if (hours > highestHours) {
            highestHours = hours
            highestEmployee = rec.employee_name || 'Unknown'
          }

          // Rep specific
          if (isRep(profile) && rec.captured_by === profile.id) {
            capturedCount++
            myHours += hours
          }

          // Department groupings
          const deptName = rec.departments?.name || 'Unassigned'
          deptHoursMap[deptName] = (deptHoursMap[deptName] || 0) + hours
          deptCostMap[deptName] = (deptCostMap[deptName] || 0) + payout

          // Status groupings
          if (statusHoursMap[rec.status] !== undefined) {
            statusHoursMap[rec.status] += hours
          }

          // Reason groupings
          const reason = rec.reason || 'Others'
          reasonCountMap[reason] = (reasonCountMap[reason] || 0) + 1
          reasonCostMap[reason] = (reasonCostMap[reason] || 0) + payout

          // Day trend
          try {
            const dateStr = format(parseISO(rec.work_date), 'MMM dd')
            trendDayMap[dateStr] = (trendDayMap[dateStr] || 0) + hours
          } catch (_) {}

          // Month trend
          try {
            const monthStr = format(startOfMonth(parseISO(rec.work_date)), 'MMM yyyy')
            trendMonthMap[monthStr] = (trendMonthMap[monthStr] || 0) + hours
          } catch (_) {}
        })
      }

      const totalRecords = records?.length || 0
      const avgHours = totalRecords > 0 ? totalHours / totalRecords : 0

      setMetrics({
        totalHours: Number(totalHours.toFixed(1)),
        employeeCount: empCount || 0,
        pendingCount,
        estimatedPayout: Number(estimatedPayout.toFixed(2)),
        capturedCount,
        myHours: Number(myHours.toFixed(1)),
        avgHours: Number(avgHours.toFixed(1)),
        highestHours: Number(highestHours.toFixed(1)),
        highestEmployee
      })

      // Day trend (last 15 active days)
      const compiledDay = Object.keys(trendDayMap).map(date => ({
        date,
        hours: Number(trendDayMap[date].toFixed(1))
      })).slice(-15)
      setChartData(compiledDay)

      // Month trend
      const compiledMonth = Object.keys(trendMonthMap).map(month => ({
        date: month,
        hours: Number(trendMonthMap[month].toFixed(1))
      }))
      setMonthChartData(compiledMonth)

      // Dept chart
      const compiledDept = Object.keys(deptHoursMap).map((dept, idx) => ({
        name: dept,
        value: Number(deptHoursMap[dept].toFixed(1)),
        color: GREEN_SHADES[idx % GREEN_SHADES.length]
      }))
      setDeptData(compiledDept)

      // Status chart
      const compiledStatus = Object.keys(statusHoursMap).map(status => ({
        name: status,
        value: Number(statusHoursMap[status].toFixed(1)),
        color: STATUS_COLORS[status]
      })).filter(s => s.value > 0)
      setStatusData(compiledStatus)

      // Reason chart
      const compiledReason = Object.keys(reasonCountMap).map(reason => ({
        name: reason,
        count: reasonCountMap[reason],
        color: REASON_COLORS[reason] || '#A78BFA'
      })).sort((a, b) => b.count - a.count)
      setReasonData(compiledReason)

      // Cost by Reason chart
      const compiledReasonCost = Object.keys(reasonCostMap).map(reason => ({
        name: reason,
        cost: Number(reasonCostMap[reason].toFixed(2)),
        color: REASON_COLORS[reason] || '#A78BFA'
      })).sort((a, b) => b.cost - a.cost)
      setReasonCostData(compiledReasonCost)

      // Cost by Department chart
      const compiledDeptCost = Object.keys(deptCostMap).map((dept, idx) => ({
        name: dept,
        cost: Number(deptCostMap[dept].toFixed(2)),
        color: GREEN_SHADES[idx % GREEN_SHADES.length]
      })).sort((a, b) => b.cost - a.cost)
      setDeptCostData(compiledDeptCost)

    } catch (err) {
      console.error('Error loading dashboard metrics:', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
    if (isAdmin(profile)) {
      fetchBlocks()
      fetchDepartments()
      fetchTimedOutRecords()
    }
    const channel = supabase
      .channel('live-dashboard-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overtime_records' }, () => {
        loadDashboardData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, dateFilter, customDateRange.startDate, customDateRange.endDate])

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-8 animate-pulse font-sans">
        <div className="h-10 bg-gray-200 rounded-lg w-1/3"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-32"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-28"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-96"></div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-96"></div>
        </div>
      </div>
    )
  }

  const activeTrendData = trendView === 'day' ? chartData : monthChartData

  return (
    <div className="space-y-8 font-sans">

      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Hello, {profile?.full_name.split(' ')[0]}!
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Here's the summary overview for your portal dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRep(profile) && (
            <Link
              to="/records/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98]"
            >
              <PlusCircle size={16} />
              <span>Capture Overtime</span>
            </Link>
          )}
          {isAdmin(profile) && (
            <>
              <Link
                to="/users"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-[#A9AEB1] hover:bg-gray-50 text-gray-700 font-bold text-sm shadow-sm transition-all"
              >
                <Users size={16} />
                <span>User Directory</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Date Filter Section ── */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h4 className="text-sm font-bold text-[#006939] uppercase tracking-wider mb-4">Filter by Period</h4>
        <div className="flex flex-wrap items-end gap-4">
          {/* Quick filter buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'all'
                  ? 'bg-[#006939] text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'month'
                  ? 'bg-[#006939] text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDateFilter('quarter')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'quarter'
                  ? 'bg-[#006939] text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 3 Months
            </button>
            <button
              onClick={() => setDateFilter('custom')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                dateFilter === 'custom'
                  ? 'bg-[#006939] text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Custom Range
            </button>
          </div>

          {/* Custom date range inputs */}
          {dateFilter === 'custom' && (
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">From</label>
                <input
                  type="date"
                  value={customDateRange.startDate}
                  onChange={(e) => setCustomDateRange({ ...customDateRange, startDate: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">To</label>
                <input
                  type="date"
                  value={customDateRange.endDate}
                  onChange={(e) => setCustomDateRange({ ...customDateRange, endDate: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ADMIN: Block Entries Panel ── */}
      {isAdmin(profile) && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2.5 bg-red-50 rounded-xl">
              <ShieldBan size={20} className="text-red-600" />
            </div>
            <div>
              <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans">Block Entries</h4>
              <p className="text-xs text-gray-400 mt-0.5">Prevent all users from submitting overtime entries during a specified period.</p>
            </div>
          </div>

            <form onSubmit={handleBlockEntries} className="bg-gray-50 rounded-xl border border-gray-100 p-5 mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                    required
                    className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
                    disabled={blocking}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                    required
                    className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
                    disabled={blocking}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Company (Optional)</label>
                  <select
                    value={blockCompany}
                    onChange={(e) => setBlockCompany(e.target.value)}
                    className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
                    disabled={blocking}
                  >
                    <option value="">All Companies</option>
                    <option value="CBI">CBI</option>
                    <option value="Abanach">Abanach</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Department (Optional)</label>
                  <select
                    value={blockDepartmentId}
                    onChange={(e) => setBlockDepartmentId(e.target.value)}
                    className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all"
                    disabled={blocking}
                  >
                    <option value="">All Departments</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Reason</label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="e.g. Payroll"
                    className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] transition-all placeholder-gray-400"
                    disabled={blocking}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
                  <button
                    type="submit"
                    disabled={blocking}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                  {blocking ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <ShieldBan size={15} />
                      <span>Block Period</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Existing block windows list */}
          {loadingBlocks ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : activeBlocks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Status</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">From</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">To</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Scope</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Reason</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Created</th>
                    <th className="text-center px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeBlocks.map((block) => {
                    const status = getBlockStatus(block)
                    return (
                      <tr key={block.id} className={`border-b border-gray-50 transition-colors ${
                        status === 'active' ? 'bg-red-50/50' : status === 'upcoming' ? 'bg-amber-50/30' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            status === 'active'
                              ? 'bg-red-100 text-red-700'
                              : status === 'upcoming'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              status === 'active' ? 'bg-red-500 animate-pulse' : status === 'upcoming' ? 'bg-amber-500' : 'bg-gray-400'
                            }`}></span>
                            {status === 'active' ? 'Active' : status === 'upcoming' ? 'Upcoming' : 'Expired'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-700">
                          {format(new Date(block.start_at), 'dd MMM yyyy, HH:mm')}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                          {format(new Date(block.end_at), 'MMM dd, HH:mm')}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">
                          {block.company || 'All'} {block.departments?.name ? `/ ${block.departments.name}` : ''}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 truncate max-w-[200px]" title={block.reason}>
                          {block.reason}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">
                          {format(new Date(block.created_at), 'dd MMM yyyy')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            disabled={deletingBlockId === block.id}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                            title="Remove block"
                          >
                            {deletingBlockId === block.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-5 text-gray-400 text-xs bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <ShieldBan size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="font-medium">No active blocking windows.</p>
              <p className="mt-0.5">Create one above to restrict overtime entry submissions.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ADMIN: Timed Out Records Panel ── */}
      {isAdmin(profile) && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2.5 bg-orange-50 rounded-xl">
              <Clock size={20} className="text-orange-600" />
            </div>
            <div>
              <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans">Timed Out Records ({timedOutRecords.length})</h4>
              <p className="text-xs text-gray-400 mt-0.5">Records that have passed their 5-day supervisor review window. Grant extensions to allow review.</p>
            </div>
          </div>

          {loadingTimedOut ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : timedOutRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Employee</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Department</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Shift Date</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Captured At</th>
                    <th className="text-center px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {timedOutRecords.map((rec) => (
                    <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium">{rec.employee_name}</td>
                      <td className="px-3 py-2.5 text-gray-500">{rec.departments?.name}</td>
                      <td className="px-3 py-2.5 text-gray-600">{format(parseISO(rec.work_date), 'MMM dd, yyyy')}</td>
                      <td className="px-3 py-2.5 text-gray-500">{format(new Date(rec.captured_at), 'MMM dd, HH:mm')}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => handleGrantExtension(rec.id)}
                          className="px-3 py-1 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-md text-xs font-bold transition-colors"
                        >
                          +7 Days
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No timed out records pending review.</p>
          )}
        </div>
      )}

      {/* ── ROW 1: Primary KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Total / Dept Overtime */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#006939]"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {isRep(profile) ? 'Department Overtime' : 'Total Overtime'}
              </p>
              <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-2 tracking-tight">
                {formatNumber(metrics.totalHours, 1)} <span className="text-xs font-bold text-gray-400">HRS</span>
              </h3>
            </div>
            <div className="p-3 bg-[#E8F5EE] rounded-xl text-[#006939] shrink-0">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-xs text-gray-400 pl-2">Cumulative captured overtime hours.</p>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#FDB913]"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending Approvals</p>
              <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-2 tracking-tight">{metrics.pendingCount}</h3>
            </div>
            <div className="p-3 bg-[#FFF8E7] rounded-xl text-[#E0A200] shrink-0">
              <FileCheck size={20} />
            </div>
          </div>
          <p className="text-xs text-gray-400 pl-2">Awaiting Supervisor review action.</p>
        </div>

        {/* Employees */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#A9AEB1]"></div>
          <div className="flex justify-between items-start pl-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {isRep(profile) || isSupervisor(profile) ? 'Dept Employees' : 'Active Staff'}
              </p>
              <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-2 tracking-tight">{metrics.employeeCount}</h3>
            </div>
            <div className="p-3 bg-gray-100 rounded-xl text-gray-600 shrink-0">
              <Users size={20} />
            </div>
          </div>
          <p className="text-xs text-gray-400 pl-2">Registered on portal database.</p>
        </div>

        {/* Payout (Admin) / My Entries (Rep) */}
        {isRep(profile) ? (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-blue-500"></div>
            <div className="flex justify-between items-start pl-2">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">My Captured Entries</p>
                <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-2 tracking-tight">
                  {metrics.capturedCount} <span className="text-xs text-gray-400">({formatNumber(metrics.myHours, 1)} Hrs)</span>
                </h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl text-blue-600 shrink-0">
                <PlusCircle size={20} />
              </div>
            </div>
            <p className="text-xs text-gray-400 pl-2">Entries logged personally by you.</p>
          </div>
        ) : isAdmin(profile) ? (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-emerald-600" />
            <div className="flex justify-between items-start pl-2">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Est. Total Payout</p>
                <h3 className="text-3xl font-[900] text-[#1A1A1A] mt-2 tracking-tight">
                  {formatCurrency(metrics.estimatedPayout || 0)}
                </h3>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                <DollarSign size={20} />
              </div>
            </div>
            <p className="text-xs text-gray-400 pl-2">Calculated using overtime rate multipliers.</p>
          </div>
        ) : null}
      </div>

      {/* ── ROW 2: New KPI Spotlight Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Average Overtime */}
        <div className="bg-gradient-to-br from-[#006939] to-[#004D2A] p-6 rounded-2xl shadow-lg text-white flex items-center gap-5 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-10">
            <Sigma size={100} />
          </div>
          <div className="p-4 bg-white/15 rounded-2xl shrink-0">
            <Sigma size={26} className="text-[#FDB913]" />
          </div>
          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">Avg. Overtime / Record</p>
            <p className="text-4xl font-[900] text-white mt-1 tracking-tight">
              {formatNumber(metrics.avgHours, 1)}
              <span className="text-sm font-bold text-white/60 ml-1">HRS</span>
            </p>
            <p className="text-xs text-white/50 mt-1">Mean hours across all overtime entries.</p>
          </div>
        </div>

        {/* Highest Overtime Record */}
        <div className="bg-gradient-to-br from-[#FDB913] to-[#E0A200] p-6 rounded-2xl shadow-lg text-[#1A1A1A] flex items-center gap-5 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-10">
            <Award size={100} />
          </div>
          <div className="p-4 bg-black/10 rounded-2xl shrink-0">
            <Award size={26} className="text-[#004D2A]" />
          </div>
          <div>
            <p className="text-xs text-[#004D2A]/70 font-bold uppercase tracking-widest">Highest Single Record</p>
            <p className="text-4xl font-[900] text-[#004D2A] mt-1 tracking-tight">
              {formatNumber(metrics.highestHours, 1)}
              <span className="text-sm font-bold text-[#004D2A]/60 ml-1">HRS</span>
            </p>
            <p className="text-xs text-[#004D2A]/60 mt-1 truncate max-w-[180px]">
              {metrics.highestEmployee || 'No records yet'}
            </p>
          </div>
        </div>

        {/* Top Overtime Reason quick stat */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-5">
            <Tag size={100} />
          </div>
          <div className="p-4 bg-purple-50 rounded-2xl shrink-0">
            <Tag size={26} className="text-purple-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Top Overtime Reason</p>
            {reasonData.length > 0 ? (
              <>
                <p className="text-xl font-[900] text-[#1A1A1A] mt-1 leading-tight truncate">
                  {reasonData[0]?.name}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {reasonData[0]?.count} record{reasonData[0]?.count !== 1 ? 's' : ''} — most frequent reason
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 3: Trend Chart + Reason Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Overtime Trend Chart — Day / Month toggle */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans flex items-center gap-2">
                <Activity size={16} />
                Overtime Trend
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">Cumulative hours over time</p>
            </div>
            {/* Day / Month toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setTrendView('day')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${trendView === 'day' ? 'bg-[#006939] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                By Day
              </button>
              <button
                onClick={() => setTrendView('month')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${trendView === 'month' ? 'bg-[#006939] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                By Month
              </button>
            </div>
          </div>

          <div className="h-[280px] w-full">
            {activeTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#006939" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#006939" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={safeTick} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="#006939"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorHours)"
                    dot={{ r: 3, fill: '#006939', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#FDB913' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <FolderOpen size={48} className="text-gray-300" />
                <p className="text-sm font-medium">No overtime records found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Reason for Overtime Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <div className="mb-5">
            <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans flex items-center gap-2">
              <Tag size={16} />
              Overtime Reasons
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">Breakdown by reason category</p>
          </div>

          {reasonData.length > 0 ? (
            <>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reasonData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {reasonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ReasonTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {reasonData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                      <span className="truncate text-gray-600 font-medium max-w-[140px]">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800 ml-2 shrink-0">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
              <FolderOpen size={40} className="text-gray-300" />
              <p className="text-sm">No reason data yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 4: Dept/Status Split ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar chart: dept or status */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="mb-5">
            <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans flex items-center gap-2">
              <BarChart2 size={16} />
              {isAdmin(profile) ? 'Overtime Hours by Department' : 'Hours by Approval Status'}
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              {isAdmin(profile) ? 'Comparison of overtime hours across departments' : 'Departmental hours split by record status'}
            </p>
          </div>
          <div className="h-[240px]">
            {((isAdmin(profile) && deptData.length > 0) || (!isAdmin(profile) && statusData.length > 0)) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={isAdmin(profile) ? deptData.map(d => ({ name: d.name, Hours: d.value, color: d.color })) : statusData.map(s => ({ name: s.name, Hours: s.value, color: s.color }))}
                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  barSize={36}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={safeTick} />
                  <Tooltip formatter={(value) => [`${value} Hrs`, 'Hours']} />
                  <Bar dataKey="Hours" radius={[6, 6, 0, 0]}>
                    {(isAdmin(profile) ? deptData : statusData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <FolderOpen size={40} className="text-gray-300" />
                <p className="text-sm">No data to display.</p>
              </div>
            )}
          </div>
        </div>

        {/* Donut: dept or status */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <div className="mb-4">
            <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans">
              {isAdmin(profile) ? 'Departmental Split' : 'Record Status Ratio'}
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              {isAdmin(profile) ? 'Proportion of total hours by dept' : 'Status division of departmental hours'}
            </p>
          </div>
          <div className="h-[180px] w-full relative flex items-center justify-center">
            {((isAdmin(profile) && deptData.length > 0) || (!isAdmin(profile) && statusData.length > 0)) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={isAdmin(profile) ? deptData : statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {(isAdmin(profile) ? deptData : statusData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Hrs`, 'Hours']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-400 gap-2">
                <FolderOpen size={40} className="text-gray-300" />
                <p className="text-sm">No details to chart.</p>
              </div>
            )}
          </div>
          <div className="mt-4 space-y-1.5 text-xs text-gray-600 max-h-[80px] overflow-y-auto pr-1">
            {(isAdmin(profile) ? deptData : statusData).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                  <span className="truncate max-w-[120px] font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-gray-800">{item.value} Hrs</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ROW 5: Cost Analysis (Admin Only) ── */}
      {isAdmin(profile) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Cost by Reason Chart */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
            <div className="mb-5">
              <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans flex items-center gap-2">
                <DollarSign size={16} />
                Cost by Reason
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">Estimated payout breakdown by overtime reason</p>
            </div>

            {reasonCostData.length > 0 ? (
              <>
                <div className="h-[240px] w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={reasonCostData.map(d => ({ name: d.name, Cost: d.cost, color: d.color }))}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                      barSize={36}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={safeTick} />
                      <Tooltip formatter={(value) => [formatCurrency(value), 'Cost']} />
                      <Bar dataKey="Cost" radius={[6, 6, 0, 0]}>
                        {reasonCostData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {reasonCostData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                        <span className="truncate text-gray-600 font-medium max-w-[140px]">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-800 ml-2 shrink-0">{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                <FolderOpen size={40} className="text-gray-300" />
                <p className="text-sm">No cost data yet.</p>
              </div>
            )}
          </div>

          {/* Cost by Department Chart */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
            <div className="mb-5">
              <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans flex items-center gap-2">
                <DollarSign size={16} />
                Cost by Department
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">Total estimated payout per department</p>
            </div>

            {deptCostData.length > 0 ? (
              <>
                <div className="h-[240px] w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={deptCostData.map(d => ({ name: d.name, Cost: d.cost, color: d.color }))}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                      barSize={36}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={safeTick} />
                      <Tooltip formatter={(value) => [formatCurrency(value), 'Cost']} />
                      <Bar dataKey="Cost" radius={[6, 6, 0, 0]}>
                        {deptCostData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {deptCostData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                        <span className="truncate text-gray-600 font-medium max-w-[140px]">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-800 ml-2 shrink-0">{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                <FolderOpen size={40} className="text-gray-300" />
                <p className="text-sm">No cost data yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ROW 6: Quick Link to Registry ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h4 className="text-md font-bold text-[#006939] uppercase tracking-wider font-sans">
              Recent Overtime Registrations
            </h4>
            <p className="text-xs text-gray-400 mt-1">Quick access to the full records registry.</p>
          </div>
          <Link
            to="/records"
            className="text-xs text-[#006939] hover:text-[#004D2A] font-bold flex items-center gap-1 hover:underline"
          >
            <span>Go to Registry</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <p className="font-semibold">Ready to review all overtime details?</p>
          <p className="text-xs mt-1">Access the records registry for details, edits, filters, and review approvals.</p>
          <Link
            to="/records"
            className="inline-block mt-3 px-4 py-1.5 rounded-lg bg-[#006939] text-white hover:bg-[#004D2A] font-bold text-xs shadow-sm"
          >
            View Overtime Registry
          </Link>
        </div>
      </div>

    </div>
  )
}

export default DashboardPage
