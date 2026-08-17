import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { logActivity } from '../utils/auditLogger'
import { 
  Calendar, 
  Search, 
  PlusCircle, 
  Trash2, 
  ArrowLeft, 
  Loader2, 
  AlertTriangle,
  Info
} from 'lucide-react'
import toast from 'react-hot-toast'

export const HolidaysPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // State Management
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [searchText, setSearchText] = useState('')

  // Form State
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayName, setHolidayName] = useState('')

  // Fetch holidays list
  const fetchHolidays = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('holiday_date', { ascending: true })

      if (error) throw error
      setHolidays(data || [])
    } catch (err) {
      console.error("Error loading holidays:", err.message)
      toast.error("Failed to load holidays list.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHolidays()
  }, [])

  // Handle Add Holiday
  const handleAddHoliday = async (e) => {
    e.preventDefault()

    if (!holidayDate) {
      toast.error("Please select a holiday date.")
      return
    }

    if (!holidayName.trim()) {
      toast.error("Please specify a holiday name.")
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('holidays')
        .insert({
          holiday_date: holidayDate,
          name: holidayName.trim(),
          created_by: profile?.id
        })

      if (error) {
        if (error.code === '23505') {
          throw new Error("A holiday is already registered for this date.")
        }
        throw error
      }

      await logActivity('Created Holiday', { date: holidayDate, name: holidayName.trim() })
      toast.success(`Holiday "${holidayName.trim()}" added successfully.`)
      setHolidayDate('')
      setHolidayName('')
      fetchHolidays()
    } catch (err) {
      console.error("Save failed:", err.message)
      toast.error(err.message || "Failed to save holiday.")
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete Holiday
  const handleDeleteHoliday = async (holiday) => {
    const formattedDate = formatHolidayDate(holiday.holiday_date)
    const confirmMsg = `Are you sure you want to delete the holiday "${holiday.name}" on ${formattedDate}?`
    if (!window.confirm(confirmMsg)) return

    try {
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', holiday.id)

      if (error) throw error

      await logActivity('Deleted Holiday', { date: holiday.holiday_date, name: holiday.name })
      toast.success(`Holiday "${holiday.name}" deleted.`)
      fetchHolidays()
    } catch (err) {
      console.error("Delete failed:", err.message)
      toast.error(err.message || "Failed to delete holiday.")
    }
  }

  // Formatting date correctly without timezone shift
  const formatHolidayDate = (dateStr) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const dateObj = new Date(year, month - 1, day)
    return dateObj.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  // Filter holidays
  const filteredHolidays = holidays.filter(h => {
    const search = searchText.toLowerCase().trim()
    if (!search) return true
    const nameMatch = h.name.toLowerCase().includes(search)
    const dateMatch = h.holiday_date.includes(search)
    const formattedDateMatch = formatHolidayDate(h.holiday_date).toLowerCase().includes(search)
    return nameMatch || dateMatch || formattedDateMatch
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans animate-fade-in">
      {/* Top Header Block */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Holiday Management
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Indicate dates of the year that are public holidays to automate overtime rate multiplier calculations.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side: Add New Holiday Form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]"></div>
          <form onSubmit={handleAddHoliday} className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#006939] uppercase tracking-wider flex items-center gap-1.5">
              <PlusCircle size={16} />
              <span>Add Holiday</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                Holiday Date
              </label>
              <input
                type="date"
                required
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer font-medium"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                Holiday Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Christmas Day"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all font-medium"
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 w-full px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <PlusCircle size={16} />
                  <span>Add Holiday</span>
                </>
              )}
            </button>

            {/* Info notice box */}
            <div className="bg-[#006939]/5 border border-[#006939]/10 rounded-xl p-3 text-xs text-gray-600 flex items-start gap-2 mt-4">
              <Info size={14} className="text-[#006939] shrink-0 mt-0.5" />
              <p>
                Holidays defined here dynamically apply a <strong>2.0x</strong> multiplier for CBI and a <strong>1.5x</strong> multiplier for Abanach on the selected dates.
              </p>
            </div>
          </form>
        </div>

        {/* Right Side: Holidays Directory */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative flex flex-col min-h-[450px]">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]"></div>

          {/* Search bar inside header */}
          <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={16} className="text-[#006939]" />
              <span>Holidays Calendar ({filteredHolidays.length})</span>
            </h3>

            <div className="relative rounded-lg shadow-sm w-full sm:max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search size={14} />
              </div>
              <input
                type="text"
                placeholder="Search holidays..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="block w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="animate-spin text-[#006939]" size={36} />
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Loading Holidays...</span>
              </div>
            ) : filteredHolidays.length > 0 ? (
              <div className="overflow-hidden border border-gray-150 rounded-xl bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-150 text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Holiday Name</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 text-xs">
                    {filteredHolidays.map((holiday) => (
                      <tr key={holiday.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-bold text-gray-700 whitespace-nowrap">
                          {holiday.holiday_date}
                          <span className="block text-[10px] text-gray-400 font-semibold mt-0.5">
                            {formatHolidayDate(holiday.holiday_date).split(',')[0]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 font-medium">
                          {holiday.name}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteHoliday(holiday)}
                            className="inline-flex items-center justify-center p-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded-lg border border-red-200 hover:border-red-600 transition-all active:scale-95"
                            title="Delete Holiday"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
                <AlertTriangle size={32} className="text-gray-300 mb-2" />
                <p className="text-sm font-semibold">No holidays found</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs">
                  {searchText ? "No holidays match your search terms." : "Get started by adding a national holiday date in the left panel."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default HolidaysPage
