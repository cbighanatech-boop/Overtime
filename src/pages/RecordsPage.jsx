import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft,
  ChevronsRight,
  Eye, 
  Edit, 
  Trash2, 
  CheckSquare, 
  PlusCircle, 
  Calendar,
  Clock,
  XCircle,
  FileSpreadsheet,
  FolderOpen,
  AlertTriangle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { canEditRecord, canDeleteRecord, canReviewRecord, canSelectRecord, isReviewTimedOut } from '../utils/roleHelpers'
import ReviewModal from '../components/records/ReviewModal'
import BulkReviewModal from '../components/records/BulkReviewModal'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const ITEMS_PER_PAGE = 20

export const RecordsPage = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // State Management
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([])
  const [departments, setDepartments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [exportLoading, setExportLoading] = useState(false)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)


  // Filters State
  const [searchText, setSearchText] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)

  // Modal Review State
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)

  // Bulk Review State
  const [selectedRecordIds, setSelectedRecordIds] = useState([])
  const [bulkReviewModalOpen, setBulkReviewModalOpen] = useState(false)
  const [bulkActionType, setBulkActionType] = useState('Approved')

  // Fetch departments (for Admin filter selection)
  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name')
      if (!error && data) {
        setDepartments(data)
      }
    }
    fetchDepartments()
  }, [])

  // Fetch overtime records with multi-filters and pagination
  const fetchRecords = async () => {
    if (!profile) return
    setLoading(true)
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE

      // Start building query. Using !inner to do full relational profiles joining
      let query = supabase
        .from('overtime_records')
        .select(`
          *,
          departments (
            name
          )
        `, { count: 'exact' })

      // 1. Role boundaries
      if (!profile.role || profile.role === 'admin') {
        // Admins can see all departments, check dropdown filter
        if (selectedDept) {
          query = query.eq('department_id', selectedDept)
        }
      } else {
        // Supervisor & Rep see strictly their own department
        query = query.eq('department_id', profile.department_id)
      }

      // 2. Status filter
      if (selectedStatus) {
        query = query.eq('status', selectedStatus)
      }

      // 3. Search query (employee name check)
      if (searchText.trim()) {
        query = query.ilike('employee_name', `%${searchText.trim()}%`)
      }

      // 4. Date Range Filters
      if (startDate) {
        query = query.gte('work_date', startDate)
      }
      if (endDate) {
        query = query.lte('work_date', endDate)
      }

      // 5. Pagination ranges and sort by date descending
      query = query
        .order('work_date', { ascending: false })
        .range(offset, offset + ITEMS_PER_PAGE - 1)

      const { data, count, error } = await query

      if (error) throw error

      setRecords(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      console.error("Error fetching overtime registry:", err.message)
      toast.error(err.message || "Failed to load overtime registry.")
    } finally {
      setLoading(false)
    }
  }

  // Trigger query fetch on filters, page change, or user load
  useEffect(() => {
    setSelectedRecordIds([])
    fetchRecords()
  }, [profile, currentPage, selectedStatus, selectedDept, startDate, endDate])

  // Split search triggering to debounce/prevent excessive DB queries
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSelectedRecordIds([])
      setCurrentPage(1) // Reset page on search typing
      fetchRecords()
    }, 400)

    return () => clearTimeout(delayDebounceFn)
  }, [searchText])

  // Real-time Subscriptions (Part 16)
  useEffect(() => {
    const channel = supabase
      .channel('live-records-registry')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'overtime_records'
      }, () => {
        fetchRecords()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, currentPage, selectedStatus, selectedDept, startDate, endDate])

  // Delete handler (Admin only)
  const handleDelete = async (id) => {
    if (!window.confirm("Are you absolutely sure you want to delete this overtime record? This action cannot be undone.")) return
    
    try {
      const { error } = await supabase
        .from('overtime_records')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success("Record deleted successfully.")
      fetchRecords()
    } catch (err) {
      console.error("Delete failed:", err.message)
      toast.error(err.message || "Failed to delete record.")
    }
  }

  // Bulk Delete handler (Admin only)
  const handleBulkDelete = async () => {
    if (selectedRecordIds.length === 0) return
    if (!window.confirm(
      `Are you absolutely sure you want to delete ${selectedRecordIds.length} overtime record(s)?\n\nThis action cannot be undone.`
    )) return

    setBulkDeleteLoading(true)
    try {
      const { error } = await supabase
        .from('overtime_records')
        .delete()
        .in('id', selectedRecordIds)

      if (error) throw error
      toast.success(`${selectedRecordIds.length} record(s) deleted successfully.`)
      setSelectedRecordIds([])
      fetchRecords()
    } catch (err) {
      console.error("Bulk delete failed:", err.message)
      toast.error(err.message || "Failed to delete selected records.")
    } finally {
      setBulkDeleteLoading(false)
    }
  }

  // Pagination navigation helpers
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // Export all filtered records to Excel
  const exportRecords = async () => {
    if (!profile) return
    setExportLoading(true)
    try {
      // Build same query as fetchRecords but without pagination
      let query = supabase
        .from('overtime_records')
        .select(`*, departments (name)`, { count: 'exact' })

      if (!profile.role || profile.role === 'admin') {
        if (selectedDept) query = query.eq('department_id', selectedDept)
      } else {
        query = query.eq('department_id', profile.department_id)
      }

      if (selectedStatus) query = query.eq('status', selectedStatus)
      if (searchText.trim()) query = query.ilike('employee_name', `%${searchText.trim()}%`)
      if (startDate) query = query.gte('work_date', startDate)
      if (endDate) query = query.lte('work_date', endDate)

      // Order newest first
      query = query.order('work_date', { ascending: false })

      const { data, error } = await query
      if (error) throw error

      // Convert to worksheet
      const worksheet = XLSX.utils.json_to_sheet(data.map(rec => ({
        "Staff ID": rec.employee_id,
        Employee: rec.employee_name,
        Department: rec.departments?.name,
        Date: rec.work_date,
        "1.0x Hours": String(rec.rate_multiplier) === '1.0' ? rec.overtime_hours : '',
        "1.5x Hours": String(rec.rate_multiplier) === '1.5' ? rec.overtime_hours : '',
        "2.0x Hours": String(rec.rate_multiplier) === '2.0' ? rec.overtime_hours : '',
        Rate: rec.hourly_rate,
        Payout: rec.estimated_payout,
        Description: rec.description,
        Reason: rec.reason,
        Status: rec.status,
      })))
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Overtime')
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `overtime_export_${new Date().toISOString().slice(0,10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Exported records to Excel')
    } catch (err) {
      console.error('Export failed:', err.message)
      toast.error(err.message || 'Failed to export records')
    } finally {
      setExportLoading(false)
    }
  }

  // Clear all filters
  const handleClearFilters = () => {
    setSearchText('')
    setSelectedStatus('')
    setSelectedDept('')
    setStartDate('')
    setEndDate('')
    setCurrentPage(1)
  }

  // Status Badge styles (Strict brand contrast rules)
  const getStatusBadge = (rec) => {
    const status = rec.status
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#D1FAE5] text-[#065F46] border border-[#059669]">
            Approved
          </span>
        )
      case 'Pending':
        if (isReviewTimedOut(rec)) {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
              <Clock size={12} />
              Timed Out
            </span>
          )
        }
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#D97706] shimmer-subtle">
            Pending
          </span>
        )
      case 'Declined':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#991B1B] border border-[#DC2626]">
            Declined
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
            {status}
          </span>
        )
    }
  }

  const pageSelectableRecords = records.filter(rec => canSelectRecord(profile, rec))
  const isAllPageSelectableChecked = pageSelectableRecords.length > 0 && pageSelectableRecords.every(rec => selectedRecordIds.includes(rec.id))

  const handleHeaderCheckboxChange = () => {
    if (isAllPageSelectableChecked) {
      const pageSelectableIds = pageSelectableRecords.map(r => r.id)
      setSelectedRecordIds(prev => prev.filter(id => !pageSelectableIds.includes(id)))
    } else {
      const pageSelectableIds = pageSelectableRecords.map(r => r.id)
      setSelectedRecordIds(prev => {
        const merged = new Set([...prev, ...pageSelectableIds])
        return Array.from(merged)
      })
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Registry Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Overtime Registry
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Search, filter, view and review department overtime records logs.
          </p>
        </div>
        {profile && (profile.role === 'admin' || profile.role === 'rep') && (
          <Link
            to="/records/new"
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] shrink-0 font-sans"
          >
            <PlusCircle size={16} />
            <span>New Capture Entry</span>
          </Link>
        )}
      </div>

      {/* -------------------------------------------------------------
          FILTER CONTROLLERS PANEL (Premium grid)
         ------------------------------------------------------------- */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[#006939] font-bold text-xs uppercase tracking-wider">
          <Filter size={16} />
          <span>Search & Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Search bar */}
          <div className="relative rounded-lg shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search size={14} />
            </div>
            <input
              type="text"
              placeholder="Search Employee..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
            />
          </div>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
            className="block w-full px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Declined">Declined</option>
          </select>

          {/* Department filter (Admin only) */}
          {profile && profile.role === 'admin' ? (
            <select
              value={selectedDept}
              onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
              className="block w-full px-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          ) : (
            <div className="bg-[#E8F5EE] border border-green-200 rounded-lg px-3 py-2 text-xs font-semibold text-[#006939] truncate flex items-center justify-between">
              <span>Department:</span>
              <span className="font-bold">{profile?.departments?.name || 'My Department'}</span>
            </div>
          )}

          {/* Date Picker Start */}
          <div className="relative rounded-lg shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Calendar size={14} />
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="block w-full pl-9 pr-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer"
              title="Start Date"
            />
          </div>

          {/* Date Picker End */}
          <div className="relative rounded-lg shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Calendar size={14} />
            </div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="block w-full pl-9 pr-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all cursor-pointer"
              title="End Date"
            />
          </div>
        </div>

        {/* Export & Clear Filters actions */}
        <div className="flex justify-end pt-1 gap-3">
          <button
            type="button"
            onClick={exportRecords}
            disabled={exportLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-md text-xs font-bold transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            <span>{exportLoading ? 'Exporting...' : 'Export Excel'}</span>
          </button>
          {(searchText || selectedStatus || selectedDept || startDate || endDate) && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#DC2626] font-bold hover:underline"
            >
              <XCircle size={14} />
              <span>Clear Active Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
          REGISTRY RECORDS TABLE PANEL
         ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        
        {loading ? (
          /* Table loading skeleton */
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(idx => (
                <div key={idx} className="flex gap-4 h-12 items-center border-b border-gray-100">
                  <div className="h-4 bg-gray-200 rounded w-1/5"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/12"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/12"></div>
                  <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          </div>
        ) : records.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllPageSelectableChecked}
                      onChange={handleHeaderCheckboxChange}
                      disabled={pageSelectableRecords.length === 0}
                      className="w-4 h-4 text-[#006939] border-gray-300 rounded focus:ring-[#006939] cursor-pointer disabled:cursor-not-allowed"
                    />
                  </th>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Shift Date</th>
                  <th className="px-6 py-4">Hours</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {records.map((rec) => {
                  const isSelectable = canReviewRecord(profile, rec)
                  const isChecked = selectedRecordIds.includes(rec.id)
                  return (
                    <tr key={rec.id} className={`hover:bg-[#E8F5EE]/30 transition-colors ${isChecked ? 'bg-[#E8F5EE]/20' : ''}`}>
                      {/* Checkbox cell */}
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!isSelectable}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedRecordIds(prev => prev.filter(id => id !== rec.id))
                            } else {
                              setSelectedRecordIds(prev => [...prev, rec.id])
                            }
                          }}
                          className="w-4 h-4 text-[#006939] border-gray-300 rounded focus:ring-[#006939] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>

                      {/* Employee cell */}
                      <td className="px-6 py-4 font-semibold text-[#1A1A1A]">
                        {rec.employee_name}
                      </td>
                    
                    {/* Department cell */}
                    <td className="px-6 py-4 text-gray-500 font-medium">
                      {rec.departments?.name}
                    </td>
                    
                    {/* Date cell */}
                    <td className="px-6 py-4 text-gray-600 font-medium">
                      {rec.work_date && !isNaN(parseISO(rec.work_date)) ? format(parseISO(rec.work_date), 'MMM dd, yyyy') : String(rec.work_date || 'N/A')}
                    </td>
                    
                    {/* Hours cell */}
                    <td className="px-6 py-4 font-bold text-[#006939]">
                      {rec.overtime_hours} Hrs
                    </td>
                    
                    {/* Status Badge */}
                    <td className="px-6 py-4">
                      {getStatusBadge(rec)}
                    </td>
                    
                    {/* Description cell */}
                    <td className="px-6 py-4 text-xs text-gray-500 max-w-[200px] truncate" title={rec.description}>
                      {rec.description}
                    </td>

                    {/* Actions cell */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* View Button */}
                        <Link
                          to={`/records/${rec.id}`}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-[#006939] transition-colors"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </Link>

                        {/* Edit Button (RBAC controlled check) */}
                        {canEditRecord(profile, rec) ? (
                          <Link
                            to={`/records/${rec.id}/edit`}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-amber-600 transition-colors"
                            title="Edit Record"
                          >
                            <Edit size={16} />
                          </Link>
                        ) : (
                          <span 
                            className="p-1.5 text-gray-300 cursor-not-allowed" 
                            title="Editing locked: record already reviewed or unauthorized."
                          >
                            <Edit size={16} />
                          </span>
                        )}

                        {/* Review Button (Supervisor & Admin only, checks pending/permissions) */}
                        {canReviewRecord(profile, rec) ? (
                          <button
                            onClick={() => {
                              setSelectedRecord(rec)
                              setReviewModalOpen(true)
                            }}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-[#006939] transition-colors"
                            title="Approve / Decline Review"
                          >
                            <CheckSquare size={16} />
                          </button>
                        ) : (
                          <span 
                            className="p-1.5 text-gray-300 cursor-not-allowed"
                            title="Review disabled: already evaluated or unauthorized."
                          >
                            <CheckSquare size={16} />
                          </span>
                        )}

                        {/* Delete Button (Admin & Rep with restrictions) */}
                        {canDeleteRecord(profile, rec) && (
                          <button
                            onClick={() => handleDelete(rec.id)}
                            className="p-1.5 rounded-md hover:bg-red-50 text-red-300 hover:text-[#DC2626] transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty Records State */
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3">
            <FolderOpen size={56} className="text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-semibold">No records match the active criteria.</p>
              <p className="text-xs text-gray-400 mt-1">Try clearing some filters or capture a new entry.</p>
            </div>
            {profile && (profile.role === 'admin' || profile.role === 'rep') && (
              <Link
                to="/records/new"
                className="mt-2 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <PlusCircle size={14} />
                <span>Capture Entry</span>
              </Link>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------
            PAGINATION CONTROLLER BAR (Step 10: 20 per page)
           ------------------------------------------------------------- */}
        {records.length > 0 && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 font-sans text-xs text-gray-500">
            <div>
              Showing <span className="font-semibold text-gray-700">{Math.min(totalCount, (currentPage - 1) * ITEMS_PER_PAGE + 1)}</span> to{' '}
              <span className="font-semibold text-gray-700">{Math.min(totalCount, currentPage * ITEMS_PER_PAGE)}</span> of{' '}
              <span className="font-semibold text-gray-700">{totalCount}</span> entries
            </div>

            <div className="flex items-center justify-center gap-1">
              {/* Go to First Page */}
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white text-gray-500 transition-colors"
                title="First Page"
              >
                <ChevronsLeft size={14} />
              </button>

              {/* Prev Page */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white text-gray-500 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Page indicator */}
              <span className="px-3 py-1.5 bg-[#006939]/10 text-[#006939] font-bold rounded border border-[#006939]/20">
                Page {currentPage} of {totalPages}
              </span>

              {/* Next Page */}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white text-gray-500 transition-colors"
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>

              {/* Go to Last Page */}
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white text-gray-500 transition-colors"
                title="Last Page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          REVIEW MODAL
         ------------------------------------------------------------- */}
      <ReviewModal 
        isOpen={reviewModalOpen} 
        onClose={() => {
          setReviewModalOpen(false)
          setSelectedRecord(null)
        }}
        record={selectedRecord}
        onSuccess={fetchRecords}
      />

      {/* -------------------------------------------------------------
          BULK REVIEW MODAL
         ------------------------------------------------------------- */}
      <BulkReviewModal
        isOpen={bulkReviewModalOpen}
        onClose={() => {
          setBulkReviewModalOpen(false)
          setSelectedRecordIds([])
        }}
        selectedRecordIds={selectedRecordIds}
        actionType={bulkActionType}
        onSuccess={() => {
          fetchRecords()
          setSelectedRecordIds([])
        }}
      />

      {/* -------------------------------------------------------------
          FLOATING BULK ACTIONS PANEL (High Premium Visual)
         ------------------------------------------------------------- */}
      {selectedRecordIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#004D2A]/95 backdrop-blur-md text-white border border-[#006939]/30 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 w-[calc(100%-2rem)] sm:w-auto sm:min-w-[480px] max-w-lg sm:max-w-none animate-fade-in-up">
          <div className="flex flex-col">
            <span className="text-sm font-black text-[#FDB913]">
              {selectedRecordIds.length} Record(s) Selected
            </span>
            <span className="text-[10px] text-white/70">
              Perform bulk evaluation actions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setBulkActionType('Approved')
                setBulkReviewModalOpen(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#006939] hover:bg-[#005c31] border border-green-500/20 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98]"
            >
              <CheckSquare size={14} className="text-[#FDB913]" />
              <span>Approve</span>
            </button>
            <button
              onClick={() => {
                setBulkActionType('Declined')
                setBulkReviewModalOpen(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-800 hover:bg-red-700 border border-red-500/20 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98]"
            >
              <XCircle size={14} className="text-white" />
              <span>Decline</span>
            </button>
            {canDeleteRecord(profile) && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-900/80 hover:bg-red-800 border border-red-500/30 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} className="text-red-300" />
                <span>{bulkDeleteLoading ? 'Deleting...' : 'Delete'}</span>
              </button>
            )}
            <button
              onClick={() => setSelectedRecordIds([])}
              className="text-[10px] font-bold text-white/60 hover:text-white hover:underline pl-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordsPage
