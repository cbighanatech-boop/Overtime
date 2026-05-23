import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/client'
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
  Tag
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
import { format, parseISO, startOfMonth } from 'date-fns'
import { isAdmin, isRep, isSupervisor } from '../utils/roleHelpers'

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
      let recordsQuery = supabase
        .from('overtime_records')
        .select(`
          *,
          departments (name),
          profiles:employee_id (full_name)
        `)
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
      const statusHoursMap = { Approved: 0, Pending: 0, Declined: 0 }
      const reasonCountMap = {}
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
            highestEmployee = rec.profiles?.full_name || 'Unknown'
          }

          // Rep specific
          if (isRep(profile) && rec.captured_by === profile.id) {
            capturedCount++
            myHours += hours
          }

          // Department groupings
          const deptName = rec.departments?.name || 'Unassigned'
          deptHoursMap[deptName] = (deptHoursMap[deptName] || 0) + hours

          // Status groupings
          if (statusHoursMap[rec.status] !== undefined) {
            statusHoursMap[rec.status] += hours
          }

          // Reason groupings
          const reason = rec.reason || 'Others'
          reasonCountMap[reason] = (reasonCountMap[reason] || 0) + 1

          // Day trend
          try {
            const dateStr = format(parseISO(rec.date), 'MMM dd')
            trendDayMap[dateStr] = (trendDayMap[dateStr] || 0) + hours
          } catch (_) {}

          // Month trend
          try {
            const monthStr = format(startOfMonth(parseISO(rec.date)), 'MMM yyyy')
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

    } catch (err) {
      console.error('Error loading dashboard metrics:', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
    const channel = supabase
      .channel('live-dashboard-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overtime_records' }, () => {
        loadDashboardData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-[#A9AEB1] p-3 rounded-lg shadow-md font-sans">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</p>
          <p className="text-sm font-extrabold text-[#006939] mt-1">
            Overtime: <span className="text-[#FDB913]">{payload[0].value}</span> Hrs
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
          <p className="font-bold text-gray-700">{payload[0].payload.name}</p>
          <p className="text-[#006939] font-extrabold mt-0.5">{payload[0].value} records</p>
        </div>
      )
    }
    return null
  }

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
                to="/reports"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FDB913] hover:bg-[#E0A200] text-[#004D2A] font-bold text-sm shadow-md transition-all active:scale-[0.98]"
              >
                <TrendingUp size={16} />
                <span>Run Analytics</span>
              </Link>
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
                {metrics.totalHours} <span className="text-xs font-bold text-gray-400">HRS</span>
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
                  {metrics.capturedCount} <span className="text-xs text-gray-400">({metrics.myHours} Hrs)</span>
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
                  GH₵{metrics.estimatedPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              {metrics.avgHours}
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
              {metrics.highestHours}
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
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
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
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
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

      {/* ── ROW 5: Quick Link to Registry ── */}
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
