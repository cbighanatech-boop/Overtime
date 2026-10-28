import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  User, 
  Clock, 
  Loader2, 
  RefreshCw,
  Eye,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday 
} from 'date-fns'

const TYPE_COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-orange-100 text-orange-800 border-orange-200'
]

export const LeaveCalendarPage = () => {
  const { profile } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDayLeaves, setSelectedDayLeaves] = useState(null)
  const [selectedDay, setSelectedDay] = useState(new Date())

  const fetchCalendarLeaves = async () => {
    if (!profile) return
    setLoading(true)
    try {
      const monthStart = format(startOfWeek(startOfMonth(currentDate)), 'yyyy-MM-dd')
      const monthEnd = format(endOfWeek(endOfMonth(currentDate)), 'yyyy-MM-dd')

      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          departments (name),
          leave_types (name)
        `)
        .eq('status', 'Approved')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart)

      if (!isAdmin(profile) && profile.department_id) {
        query = query.eq('department_id', profile.department_id)
      }

      const { data, error } = await query
      if (error) throw error
      setRequests(data || [])
    } catch (err) {
      console.error('Calendar leaves fetch error:', err.message)
      toast.error('Could not load calendar schedule.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCalendarLeaves()
  }, [currentDate, profile])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  // Find leaves active on a specific day
  const getLeavesForDay = (day) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return requests.filter(r => r.start_date <= dayStr && r.end_date >= dayStr)
  }

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const handleToday = () => {
    setCurrentDate(new Date())
    setSelectedDay(new Date())
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
            Leave Roster Calendar
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Visual departmental schedule showing approved staff absences and return dates.
          </p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 shadow-sm"
          >
            Today
          </button>
          <div className="flex items-center bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 text-xs font-black text-gray-800 uppercase min-w-[130px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/80 text-center text-xs font-bold text-gray-500 uppercase tracking-wider py-3">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
          {days.map((day, idx) => {
            const dayLeaves = getLeavesForDay(day)
            const isCurrentMonth = isSameMonth(day, monthStart)
            const isCurrentDay = isToday(day)
            const isDaySelected = isSameDay(day, selectedDay)

            return (
              <div
                key={day.toISOString()}
                onClick={() => {
                  setSelectedDay(day)
                  setSelectedDayLeaves(dayLeaves)
                }}
                className={`min-h-[110px] sm:min-h-[125px] p-2 flex flex-col justify-between transition-colors cursor-pointer ${
                  !isCurrentMonth ? 'bg-gray-50/50 text-gray-400' : 'bg-white'
                } ${isDaySelected ? 'ring-2 ring-inset ring-[#006939]' : ''} hover:bg-emerald-50/30`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      isCurrentDay
                        ? 'bg-[#006939] text-white shadow-sm'
                        : isCurrentMonth
                          ? 'text-gray-800'
                          : 'text-gray-400'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayLeaves.length > 0 && (
                    <span className="text-[10px] font-extrabold text-[#006939] bg-emerald-50 px-1.5 py-0.2 rounded">
                      {dayLeaves.length} away
                    </span>
                  )}
                </div>

                {/* Leave badges list */}
                <div className="mt-1.5 space-y-1 overflow-hidden flex-1">
                  {dayLeaves.slice(0, 2).map((leave, leaveIdx) => (
                    <div
                      key={leave.id}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold truncate border ${
                        TYPE_COLORS[leaveIdx % TYPE_COLORS.length]
                      }`}
                      title={`${leave.employee_name} (${leave.leave_types?.name})`}
                    >
                      {leave.employee_name.split(' ')[0]} - {leave.leave_types?.name}
                    </div>
                  ))}
                  {dayLeaves.length > 2 && (
                    <p className="text-[9px] font-extrabold text-gray-500 pl-1">
                      +{dayLeaves.length - 2} more
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Day Details Panel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-[#006939]" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-900">
              Absence Details for {format(selectedDay, 'EEEE, dd MMMM yyyy')}
            </h3>
          </div>
          <span className="text-xs text-gray-500 font-bold">
            {getLeavesForDay(selectedDay).length} staff on approved leave
          </span>
        </div>

        {getLeavesForDay(selectedDay).length === 0 ? (
          <div className="p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-400 font-medium">
            No employees on leave on this date.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {getLeavesForDay(selectedDay).map(l => (
              <div key={l.id} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-black text-gray-900">{l.employee_name}</p>
                    <span className="text-[10px] font-bold text-[#006939] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {l.leave_types?.name}
                    </span>
                  </div>
                  <p className="text-gray-500 mt-1">
                    ID: {l.employee_id} • {l.departments?.name}
                  </p>
                  <p className="text-gray-600 font-semibold mt-1">
                    Period: {format(parseISO(l.start_date), 'dd MMM')} – {format(parseISO(l.end_date), 'dd MMM yyyy')} ({l.total_days} days)
                  </p>
                  {l.relief_staff_name && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Relief: <strong>{l.relief_staff_name}</strong>
                    </p>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-gray-200 flex justify-end">
                  <Link
                    to={`/leave/requests/${l.id}`}
                    className="text-[11px] font-bold text-[#006939] hover:underline"
                  >
                    View Record →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeaveCalendarPage

