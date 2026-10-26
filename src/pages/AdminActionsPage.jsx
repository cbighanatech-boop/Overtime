import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useActionNotifications } from '../context/ActionNotificationContext'
import { supabase } from '../supabase/client'
import { 
  fetchAdminActions, 
  createAdminAction, 
  updateAdminAction, 
  deleteAdminAction,
  getActionDueStatus,
  SQL_MIGRATION_TEXT,
  sendBrowserNotification,
  playNotificationSound
} from '../utils/adminActionsService'
import { logActivity } from '../utils/auditLogger'
import { 
  PlusCircle, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  User, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  Bell, 
  BellRing,
  Copy, 
  Check, 
  RefreshCw,
  FolderOpen,
  ArrowUpDown,
  LayoutGrid,
  List,
  MessageSquare,
  ClipboardList,
  AlertCircle,
  X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

const PRIORITY_CONFIG = {
  Urgent: { label: 'Urgent', bg: 'bg-red-50 text-red-700 border-red-200 ring-red-500/20', dot: 'bg-red-500' },
  High: { label: 'High', bg: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20', dot: 'bg-amber-500' },
  Medium: { label: 'Medium', bg: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20', dot: 'bg-blue-500' },
  Low: { label: 'Low', bg: 'bg-gray-50 text-gray-700 border-gray-200 ring-gray-400/20', dot: 'bg-gray-400' }
}

export const AdminActionsPage = () => {
  const { profile } = useAuth()
  const { refreshActions, browserPermission, requestBrowserPermission } = useActionNotifications()

  // State
  const [actions, setActions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isUsingFallback, setIsUsingFallback] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  
  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'due' | 'pending' | 'in_progress' | 'completed'
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('due_asc') // 'due_asc' | 'due_desc' | 'priority' | 'newest'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false)
  const [copiedSql, setCopiedSql] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingAction, setEditingAction] = useState(null)

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    task_description: '',
    action_message: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    due_time: '17:00',
    assigned_to: '',
    assigned_name: '',
    assigned_email: '',
    priority: 'Medium',
    status: 'Pending'
  })

  // Load profiles to populate Assignee dropdown
  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, department_id, departments(name)')
        .order('full_name')

      if (!error && data) {
        setUsers(data)
      }
    } catch (err) {
      console.warn('Could not load users for assignment dropdown:', err)
    }
  }

  // Load action items
  const loadActionsList = async () => {
    setLoading(true)
    try {
      const { actions: data, isUsingFallback: fallback } = await fetchAdminActions()
      setActions(data)
      setIsUsingFallback(fallback)
    } catch (err) {
      console.error('Failed to load actions:', err)
      toast.error('Failed to load action items.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadActionsList()
    loadUsers()
  }, [])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingAction(null)
    setFormData({
      title: '',
      task_description: '',
      action_message: '',
      due_date: format(new Date(), 'yyyy-MM-dd'),
      due_time: '17:00',
      assigned_to: profile?.id || '',
      assigned_name: profile?.full_name || '',
      assigned_email: profile?.email || '',
      priority: 'Medium',
      status: 'Pending'
    })
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (action) => {
    setEditingAction(action)
    setFormData({
      title: action.title || '',
      task_description: action.task_description || '',
      action_message: action.action_message || '',
      due_date: action.due_date || format(new Date(), 'yyyy-MM-dd'),
      due_time: action.due_time ? action.due_time.substring(0, 5) : '17:00',
      assigned_to: action.assigned_to || '',
      assigned_name: action.assigned_name || '',
      assigned_email: action.assigned_email || '',
      priority: action.priority || 'Medium',
      status: action.status || 'Pending'
    })
    setIsModalOpen(true)
  }

  // Handle Assignee Select Change
  const handleAssigneeChange = (e) => {
    const selectedId = e.target.value
    if (selectedId === 'manual') {
      setFormData(prev => ({ ...prev, assigned_to: '', assigned_name: '', assigned_email: '' }))
      return
    }
    const found = users.find(u => u.id === selectedId)
    if (found) {
      setFormData(prev => ({
        ...prev,
        assigned_to: found.id,
        assigned_name: found.full_name,
        assigned_email: found.email
      }))
    }
  }

  // Submit Create or Edit Form
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast.error('Please enter a title for the action item.')
      return
    }
    if (!formData.task_description.trim()) {
      toast.error('Please describe the tasks to be taken.')
      return
    }
    if (!formData.due_date) {
      toast.error('Please specify a due date.')
      return
    }
    if (!formData.assigned_name.trim()) {
      toast.error('Please specify whom this task is assigned to.')
      return
    }

    setSubmitting(true)
    try {
      if (editingAction) {
        // Update
        const { success } = await updateAdminAction(editingAction.id, formData)
        if (success) {
          toast.success('Action item updated successfully!')
          logActivity('UPDATE_ADMIN_ACTION', {
            id: editingAction.id,
            title: formData.title,
            assigned_name: formData.assigned_name
          })
        }
      } else {
        // Create
        const { success } = await createAdminAction(formData, profile)
        if (success) {
          toast.success('New action item created!')
          logActivity('CREATE_ADMIN_ACTION', {
            title: formData.title,
            assigned_name: formData.assigned_name,
            due_date: formData.due_date
          })
          
          // Check if due today right away
          const today = format(new Date(), 'yyyy-MM-dd')
          if (formData.due_date === today) {
            playNotificationSound()
            sendBrowserNotification('Action Item Due Today', `${formData.title} assigned to ${formData.assigned_name} is due today!`)
          }
        }
      }

      setIsModalOpen(false)
      await loadActionsList()
      refreshActions()
    } catch (err) {
      console.error('Save failed:', err)
      toast.error('Failed to save action item.')
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle Complete
  const handleToggleComplete = async (action) => {
    const newStatus = action.status === 'Completed' ? 'Pending' : 'Completed'
    try {
      await updateAdminAction(action.id, { status: newStatus })
      toast.success(newStatus === 'Completed' ? 'Task marked as completed!' : 'Task reopened.')
      await loadActionsList()
      refreshActions()
    } catch (err) {
      toast.error('Failed to update status.')
    }
  }

  // Delete Action
  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return

    try {
      await deleteAdminAction(id)
      toast.success('Action item removed.')
      logActivity('DELETE_ADMIN_ACTION', { id, title })
      await loadActionsList()
      refreshActions()
    } catch (err) {
      toast.error('Failed to delete item.')
    }
  }

  // Copy SQL Migration
  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_TEXT)
    setCopiedSql(true)
    toast.success('SQL migration copied to clipboard!')
    setTimeout(() => setCopiedSql(false), 3000)
  }

  // Metrics computation
  const metrics = useMemo(() => {
    let overdueCount = 0
    let dueTodayCount = 0
    let inProgressCount = 0
    let completedCount = 0
    let pendingCount = 0

    actions.forEach(item => {
      const dueInfo = getActionDueStatus(item)
      if (item.status === 'Completed') {
        completedCount++
      } else {
        if (dueInfo.status === 'overdue') overdueCount++
        else if (dueInfo.status === 'due-today') dueTodayCount++

        if (item.status === 'In Progress') inProgressCount++
        else pendingCount++
      }
    })

    return {
      total: actions.length,
      overdueCount,
      dueTodayCount,
      dueAlerts: overdueCount + dueTodayCount,
      inProgressCount,
      pendingCount,
      completedCount
    }
  }, [actions])

  // Filtered & Sorted items
  const filteredActions = useMemo(() => {
    return actions.filter(item => {
      const dueInfo = getActionDueStatus(item)

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesTitle = item.title?.toLowerCase().includes(q)
        const matchesTask = item.task_description?.toLowerCase().includes(q)
        const matchesMsg = item.action_message?.toLowerCase().includes(q)
        const matchesAssignee = item.assigned_name?.toLowerCase().includes(q)
        if (!matchesTitle && !matchesTask && !matchesMsg && !matchesAssignee) return false
      }

      // Status Filter
      if (statusFilter === 'due') {
        if (!dueInfo.isDueOrOverdue) return false
      } else if (statusFilter === 'pending') {
        if (item.status !== 'Pending') return false
      } else if (statusFilter === 'in_progress') {
        if (item.status !== 'In Progress') return false
      } else if (statusFilter === 'completed') {
        if (item.status !== 'Completed') return false
      }

      // Priority Filter
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false

      // Assignee Filter
      if (assigneeFilter !== 'all') {
        if (item.assigned_name !== assigneeFilter && item.assigned_to !== assigneeFilter) return false
      }

      return true
    }).sort((a, b) => {
      if (sortBy === 'due_asc') {
        return (a.due_date || '').localeCompare(b.due_date || '')
      }
      if (sortBy === 'due_desc') {
        return (b.due_date || '').localeCompare(a.due_date || '')
      }
      if (sortBy === 'priority') {
        const rank = { Urgent: 4, High: 3, Medium: 2, Low: 1 }
        return (rank[b.priority] || 0) - (rank[a.priority] || 0)
      }
      if (sortBy === 'newest') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      }
      return 0
    })
  }, [actions, searchQuery, statusFilter, priorityFilter, assigneeFilter, sortBy])

  // Unique assignees for filter
  const uniqueAssignees = useMemo(() => {
    const set = new Set()
    actions.forEach(a => {
      if (a.assigned_name) set.add(a.assigned_name)
    })
    return Array.from(set).sort()
  }, [actions])

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* ── TOP BANNER & ACTION HEADER ── */}
      <div className="bg-gradient-to-r from-[#004D2A] to-[#006939] p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 pointer-events-none transform skew-x-12"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FDB913] text-[#004D2A]">
                Admin Only
              </span>
              {isUsingFallback && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-300/30 flex items-center gap-1">
                  <AlertCircle size={12} /> Local Storage Cache
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-[900] tracking-tight uppercase mt-2 flex items-center gap-3">
              <ClipboardList className="text-[#FDB913]" size={30} />
              Admin Action Center
            </h1>
            <p className="text-white/80 text-sm mt-1 max-w-2xl">
              Leave messages, assign critical tasks with target due dates to staff members, and track automated deadline notifications when due.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {browserPermission !== 'granted' && (
              <button
                onClick={requestBrowserPermission}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-all flex items-center gap-2"
                title="Enable browser notifications"
              >
                <BellRing size={16} className="text-[#FDB913]" />
                Enable Alerts
              </button>
            )}

            <button
              onClick={() => setIsSqlModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-all flex items-center gap-2"
              title="View Supabase SQL Schema"
            >
              <Copy size={16} />
              SQL Schema
            </button>

            <button
              onClick={handleOpenCreate}
              className="px-5 py-2.5 rounded-xl bg-[#FDB913] hover:bg-[#E0A200] text-[#004D2A] font-extrabold text-sm shadow-md transition-all active:scale-[0.98] flex items-center gap-2"
            >
              <PlusCircle size={18} />
              <span>New Action Item</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI METRICS SUMMARY ROW ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Actions */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-[#006939]">
            <ClipboardList size={26} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Actions</p>
            <p className="text-2xl font-[900] text-[#1A1A1A] mt-0.5">{metrics.total}</p>
            <p className="text-xs text-gray-400 mt-0.5">{metrics.pendingCount} pending task{metrics.pendingCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Due Alerts (Today & Overdue) */}
        <div className={`p-5 rounded-2xl border shadow-sm flex items-center gap-4 transition-all ${
          metrics.dueAlerts > 0 
            ? 'bg-rose-50/60 border-rose-200 text-rose-900 ring-2 ring-rose-500/20' 
            : 'bg-white border-gray-100'
        }`}>
          <div className={`p-3 rounded-xl ${metrics.dueAlerts > 0 ? 'bg-rose-100 text-rose-700 animate-bounce' : 'bg-amber-50 text-amber-600'}`}>
            <BellRing size={26} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Due / Overdue
            </p>
            <p className={`text-2xl font-[900] mt-0.5 ${metrics.dueAlerts > 0 ? 'text-rose-700' : 'text-[#1A1A1A]'}`}>
              {metrics.dueAlerts}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {metrics.dueTodayCount} due today • {metrics.overdueCount} overdue
            </p>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Clock size={26} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">In Progress</p>
            <p className="text-2xl font-[900] text-[#1A1A1A] mt-0.5">{metrics.inProgressCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">Under active execution</p>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle2 size={26} />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-[900] text-[#1A1A1A] mt-0.5">{metrics.completedCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">Finished deliverables</p>
          </div>
        </div>
      </div>

      {/* ── FILTER & SEARCH TOOLBAR ── */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input
              type="text"
              placeholder="Search actions by title, tasks, messages, or assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all font-sans"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-[#006939] text-white shadow-sm' : 'text-gray-600 hover:text-black'}`}
              >
                All ({actions.length})
              </button>
              <button
                onClick={() => setStatusFilter('due')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  statusFilter === 'due' 
                    ? 'bg-rose-600 text-white shadow-sm' 
                    : 'text-rose-700 hover:text-rose-900'
                }`}
              >
                <AlertTriangle size={13} />
                Due / Overdue ({metrics.dueAlerts})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'pending' ? 'bg-[#006939] text-white shadow-sm' : 'text-gray-600 hover:text-black'}`}
              >
                Pending
              </button>
              <button
                onClick={() => setStatusFilter('in_progress')}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'in_progress' ? 'bg-[#006939] text-white shadow-sm' : 'text-gray-600 hover:text-black'}`}
              >
                In Progress
              </button>
              <button
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'completed' ? 'bg-[#006939] text-white shadow-sm' : 'text-gray-600 hover:text-black'}`}
              >
                Completed
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-gray-600">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-[#006939] shadow-sm' : 'hover:text-black'}`}
                title="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-[#006939] shadow-sm' : 'hover:text-black'}`}
                title="List View"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Filters row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 text-xs">
          {/* Priority filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 font-semibold">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#006939]"
            >
              <option value="all">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Assignee filter */}
          {uniqueAssignees.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400 font-semibold">Assignee:</span>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#006939]"
              >
                <option value="all">All Assignees</option>
                {uniqueAssignees.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sort By */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-gray-400 font-semibold flex items-center gap-1">
              <ArrowUpDown size={12} /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#006939]"
            >
              <option value="due_asc">Due Date (Earliest First)</option>
              <option value="due_desc">Due Date (Latest First)</option>
              <option value="priority">Priority (Highest First)</option>
              <option value="newest">Recently Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── ACTION ITEMS LIST / GRID ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-64"></div>
          ))}
        </div>
      ) : filteredActions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-emerald-50 text-[#006939] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FolderOpen size={30} />
          </div>
          <h3 className="text-lg font-bold text-gray-800">No Action Items Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'No tasks match your active search filters.'
              : 'No action items or reminders recorded yet. Create the first task for your team!'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-5 px-5 py-2.5 rounded-xl bg-[#006939] text-white font-bold text-xs shadow-md hover:bg-[#004D2A] transition-all inline-flex items-center gap-2"
          >
            <PlusCircle size={16} />
            <span>Create Action Item</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredActions.map(action => {
            const dueInfo = getActionDueStatus(action)
            const prio = PRIORITY_CONFIG[action.priority] || PRIORITY_CONFIG.Medium
            const isDone = action.status === 'Completed'

            return (
              <div
                key={action.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition-all flex flex-col justify-between hover:shadow-md ${
                  isDone 
                    ? 'border-emerald-200 bg-emerald-50/20' 
                    : dueInfo.status === 'overdue'
                      ? 'border-rose-300 ring-1 ring-rose-400/30'
                      : dueInfo.status === 'due-today'
                        ? 'border-amber-300 ring-1 ring-amber-400/40 bg-amber-50/20'
                        : 'border-gray-100'
                }`}
              >
                <div>
                  {/* Card Header: Badges & Due Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${prio.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`}></span>
                      {prio.label}
                    </span>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${dueInfo.badgeClass}`}>
                      {dueInfo.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className={`text-base font-bold tracking-tight ${isDone ? 'line-through text-gray-400' : 'text-[#1A1A1A]'}`}>
                    {action.title}
                  </h3>

                  {/* Tasks to be taken */}
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700">
                    <p className="font-bold text-gray-500 uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1">
                      <ClipboardList size={12} className="text-[#006939]" /> Tasks To Be Taken:
                    </p>
                    <p className="whitespace-pre-line leading-relaxed font-sans">
                      {action.task_description}
                    </p>
                  </div>

                  {/* Message / Remarks */}
                  {action.action_message && (
                    <div className="mt-2.5 p-2.5 bg-amber-50/60 rounded-xl border border-amber-200/50 text-xs text-amber-900">
                      <p className="font-bold text-amber-700 uppercase tracking-wider text-[10px] mb-0.5 flex items-center gap-1">
                        <MessageSquare size={12} /> Message / Notes:
                      </p>
                      <p className="italic leading-relaxed font-sans">
                        "{action.action_message}"
                      </p>
                    </div>
                  )}

                  {/* Assigned to & Due Date */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2 text-xs text-gray-600">
                    {/* Assignee */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#006939] text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                          {action.assigned_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 leading-none">{action.assigned_name}</p>
                          {action.assigned_email && (
                            <p className="text-[10px] text-gray-400">{action.assigned_email}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400">Assigned To</span>
                    </div>

                    {/* Due Date & Time */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                        <Calendar size={14} className="text-[#006939]" />
                        <span>Due: {action.due_date ? format(parseISO(action.due_date), 'MMM dd, yyyy') : 'No date'}</span>
                        {action.due_time && (
                          <span className="text-gray-400">@ {action.due_time.substring(0, 5)}</span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        action.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                        action.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {action.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Action Buttons */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleToggleComplete(action)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isDone
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                    }`}
                  >
                    <Check size={14} />
                    <span>{isDone ? 'Reopen Task' : 'Mark Completed'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(action)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Edit Action Item"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(action.id, action.title)}
                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete Action Item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold">
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Action & Tasks</th>
                  <th className="py-3.5 px-4">Assigned To</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredActions.map(action => {
                  const dueInfo = getActionDueStatus(action)
                  const prio = PRIORITY_CONFIG[action.priority] || PRIORITY_CONFIG.Medium
                  const isDone = action.status === 'Completed'

                  return (
                    <tr 
                      key={action.id} 
                      className={`hover:bg-gray-50/80 transition-colors ${
                        dueInfo.status === 'overdue' && !isDone ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Status / Checkbox */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleComplete(action)}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                            isDone 
                              ? 'bg-emerald-600 border-emerald-600 text-white' 
                              : 'border-gray-300 hover:border-[#006939]'
                          }`}
                        >
                          {isDone && <Check size={14} />}
                        </button>
                      </td>

                      {/* Title & Task */}
                      <td className="py-3 px-4 max-w-sm">
                        <p className={`font-bold text-sm ${isDone ? 'line-through text-gray-400' : 'text-[#1A1A1A]'}`}>
                          {action.title}
                        </p>
                        <p className="text-gray-500 truncate mt-0.5 max-w-md">
                          {action.task_description}
                        </p>
                        {action.action_message && (
                          <p className="text-amber-800 italic mt-0.5 text-[11px] truncate">
                            Note: {action.action_message}
                          </p>
                        )}
                      </td>

                      {/* Assigned To */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#006939] text-white flex items-center justify-center font-bold text-[10px] uppercase">
                            {action.assigned_name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 leading-none">{action.assigned_name}</p>
                            {action.assigned_email && (
                              <p className="text-[10px] text-gray-400">{action.assigned_email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 w-max ${prio.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`}></span>
                          {prio.label}
                        </span>
                      </td>

                      {/* Due Date & Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-gray-700">
                            {action.due_date ? format(parseISO(action.due_date), 'MMM dd, yyyy') : 'No date'}
                            {action.due_time && ` ${action.due_time.substring(0, 5)}`}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border w-max ${dueInfo.badgeClass}`}>
                            {dueInfo.label}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(action)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(action.id, action.title)}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT ACTION MODAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold tracking-tight">
                  {editingAction ? 'Edit Action Item' : 'New Action Item & Task'}
                </h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Set task duties, assignment, and due deadline
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-sm font-sans">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Action Title / Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Audit Abanach shift rosters & overtime variance"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
                />
              </div>

              {/* Tasks to be taken */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Tasks To Be Taken *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detail the actionable steps, instructions, or deliverables required..."
                  value={formData.task_description}
                  onChange={(e) => setFormData({ ...formData, task_description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
                />
              </div>

              {/* Action Message / Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Message / Context Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Leave any special remarks, background context, or instructions..."
                  value={formData.action_message}
                  onChange={(e) => setFormData({ ...formData, action_message: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
                />
              </div>

              {/* Assign To (Who) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Assigned To (Whom) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <select
                      value={formData.assigned_to || (formData.assigned_name ? 'manual' : '')}
                      onChange={handleAssigneeChange}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                    >
                      <option value="">-- Select Team Member --</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role}{u.departments?.name ? ` • ${u.departments.name}` : ''})
                        </option>
                      ))}
                      <option value="manual">Manual Entry / Other</option>
                    </select>
                  </div>

                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Assignee Full Name *"
                      value={formData.assigned_name}
                      onChange={(e) => setFormData({ ...formData, assigned_name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                    />
                  </div>
                </div>
              </div>

              {/* Due Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Target Due Time
                  </label>
                  <input
                    type="time"
                    value={formData.due_time}
                    onChange={(e) => setFormData({ ...formData, due_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  />
                </div>
              </div>

              {/* Priority & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  >
                    <option value="Urgent">Urgent (Critical immediate attention)</option>
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-extrabold shadow-md transition-all active:scale-[0.98] text-xs flex items-center gap-2"
                >
                  {submitting ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{editingAction ? 'Save Changes' : 'Create Action'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SQL MIGRATION MODAL ── */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Supabase SQL Schema</h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Run this in your Supabase SQL Editor for cloud database sync
                </p>
              </div>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto font-sans text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 leading-relaxed">
                <p className="font-bold">✨ Seamless Dual-Sync Architecture:</p>
                <p className="mt-1">
                  If the table has not yet been created in Supabase, your actions are safely persisted locally in your browser so you can use the action tracker immediately. Run the SQL below in Supabase anytime for full multi-user cloud synchronization!
                </p>
              </div>

              <div className="relative">
                <pre className="p-4 bg-gray-900 text-emerald-400 rounded-xl overflow-x-auto text-[11px] leading-relaxed font-mono">
                  {SQL_MIGRATION_TEXT}
                </pre>
                <button
                  onClick={handleCopySql}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 backdrop-blur-sm transition-all"
                >
                  {copiedSql ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setIsSqlModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminActionsPage
