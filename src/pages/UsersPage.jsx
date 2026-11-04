import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { 
  Users, 
  Search, 
  PlusCircle, 
  Shield, 
  ToggleLeft, 
  ToggleRight, 
  Mail,
  Award,
  UserCheck,
  FolderOpen,
  Trash2,
  Edit2,
  Clock4,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building2,
  Save,
  X,
  Loader2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Send,
  Wrench
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import ExtraHoursPage from './ExtraHoursPage'

export const UsersPage = () => {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('directory') // 'directory' | 'supervisors' | 'extra-hours'
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [roleFilter, setRoleFilter] = useState('all') // 'all' | 'admin' | 'supervisor' | 'rep' | 'employee'

  const [currentUserId, setCurrentUserId] = useState(null)
  const [departments, setDepartments] = useState([])

  // Email Edit Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [selectedUserForEmail, setSelectedUserForEmail] = useState(null)
  const [emailInput, setEmailInput] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  // Supervisor Quick Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignDept, setAssignDept] = useState(null)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignEmail, setAssignEmail] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)

  // M365 Diagnostic Test State
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testEmailInput, setTestEmailInput] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleOpenTestModal = () => {
    setTestEmailInput(profile?.email || '')
    setTestResult(null)
    setTestModalOpen(true)
  }

  const handleRunEmailTest = async (e) => {
    if (e) e.preventDefault()
    setTestingConnection(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/send-leave-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          testEmail: testEmailInput.trim()
        })
      })
      const data = await res.json()
      setTestResult(data)
      if (data.success) {
        toast.success(data.message || 'M365 Connection Verified!')
      } else {
        toast.error(data.error || 'Connection test failed.')
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: `Network error reaching /api/send-leave-notification: ${err.message}`,
        hint: 'Check if the Vercel deployment has finished and environment variables are active.'
      })
      toast.error('Network error reaching email API.')
    } finally {
      setTestingConnection(false)
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setCurrentUserId(session?.user?.id)

      let query = supabase
        .from('profiles')
        .select(`
          *,
          departments (
            id,
            name
          )
        `)
        .order('full_name')

      if (searchText.trim()) {
        query = query.or(`full_name.ilike.%${searchText.trim()}%,email.ilike.%${searchText.trim()}%,staff_id.ilike.%${searchText.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error

      setUsers(data || [])
    } catch (err) {
      console.error("Error loading user profiles:", err.message)
      toast.error("Failed to load user directory.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [searchText])

  useEffect(() => {
    const loadDepartments = async () => {
      const { data, error } = await supabase.from('departments').select('id, name').order('name')
      if (error) console.error('Error loading departments:', error)
      else setDepartments(data || [])
    }
    loadDepartments()
  }, [])

  // Filtered users for Directory view
  const filteredUsers = useMemo(() => {
    let list = users
    if (roleFilter !== 'all') {
      list = list.filter(u => (u.role || '').toLowerCase() === roleFilter)
    }
    return list
  }, [users, roleFilter])

  // Grouped supervisors by department
  const departmentSupervisorMap = useMemo(() => {
    const map = new Map()
    departments.forEach(dept => {
      const sups = users.filter(u => u.department_id === dept.id && u.role === 'supervisor' && u.is_active)
      map.set(dept.id, sups)
    })
    return map
  }, [departments, users])

  // Active Admin users
  const adminUsers = useMemo(() => {
    return users.filter(u => u.role === 'admin' && u.is_active)
  }, [users])

  // Open Email Edit Modal
  const handleOpenEmailEdit = (user) => {
    setSelectedUserForEmail(user)
    setEmailInput(user.email || '')
    setEmailModalOpen(true)
  }

  // Save Updated Email in profiles table
  const handleSaveEmail = async (e) => {
    e.preventDefault()
    if (!selectedUserForEmail) return

    const cleaned = emailInput.trim().toLowerCase()
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      toast.error('Please enter a valid email address (e.g. name@cbi-africa.com)')
      return
    }

    setSavingEmail(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email: cleaned })
        .eq('id', selectedUserForEmail.id)

      if (error) throw error

      toast.success(`Email for ${selectedUserForEmail.full_name} updated to ${cleaned}!`)
      setUsers(prev => prev.map(u => u.id === selectedUserForEmail.id ? { ...u, email: cleaned } : u))
      setEmailModalOpen(false)
      setSelectedUserForEmail(null)
    } catch (err) {
      console.error('Email update failed:', err.message)
      toast.error(err.message || 'Failed to update email address.')
    } finally {
      setSavingEmail(false)
    }
  }

  // Open Assign Supervisor Modal for a specific Department
  const handleOpenAssignModal = (dept) => {
    setAssignDept(dept)
    const existingSups = departmentSupervisorMap.get(dept.id) || []
    if (existingSups.length > 0) {
      setAssignUserId(existingSups[0].id)
      setAssignEmail(existingSups[0].email || '')
    } else {
      setAssignUserId('')
      setAssignEmail('')
    }
    setAssignModalOpen(true)
  }

  // Save Supervisor Assignment & Email
  const handleSaveSupervisorAssignment = async (e) => {
    e.preventDefault()
    if (!assignDept || !assignUserId) {
      toast.error('Please select an employee to designate as supervisor.')
      return
    }

    const cleanedEmail = assignEmail.trim().toLowerCase()
    if (cleanedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      toast.error('Please enter a valid email address for notifications.')
      return
    }

    setSavingAssignment(true)
    try {
      const updatePayload = {
        role: 'supervisor',
        department_id: assignDept.id
      }
      if (cleanedEmail) {
        updatePayload.email = cleanedEmail
      }

      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', assignUserId)

      if (error) throw error

      const targetEmp = users.find(u => u.id === assignUserId)
      toast.success(`${targetEmp?.full_name || 'User'} assigned as Supervisor for ${assignDept.name}!`)
      
      setUsers(prev => prev.map(u => {
        if (u.id === assignUserId) {
          return {
            ...u,
            role: 'supervisor',
            department_id: assignDept.id,
            email: cleanedEmail || u.email,
            departments: { id: assignDept.id, name: assignDept.name }
          }
        }
        return u
      }))

      setAssignModalOpen(false)
      setAssignDept(null)
    } catch (err) {
      console.error('Supervisor assignment failed:', err.message)
      toast.error(err.message || 'Failed to assign supervisor.')
    } finally {
      setSavingAssignment(false)
    }
  }

  // Admin delete handler
  const handleDelete = async (targetUser) => {
    const confirmMsg = `Are you sure you want to DELETE ${targetUser.full_name} (${targetUser.role})? This action cannot be undone.`
    if (!window.confirm(confirmMsg)) return

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', targetUser.id)
      if (error) throw error

      toast.success(`${targetUser.full_name} has been deleted.`)
      setUsers(prev => prev.filter(u => u.id !== targetUser.id))
    } catch (err) {
      console.error('Delete failed:', err.message)
      toast.error(err.message || 'Failed to delete user/employee.')
    }
  }

  // Toggle active status
  const handleToggleStatus = async (user) => {
    const updatedStatus = !user.is_active
    const message = updatedStatus 
      ? `Are you sure you want to activate ${user.full_name}'s account?`
      : `Are you sure you want to deactivate ${user.full_name}'s account? Deactivated users will be locked out immediately.`

    if (!window.confirm(message)) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: updatedStatus })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name} account ${updatedStatus ? 'activated' : 'deactivated'} successfully.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: updatedStatus } : u))
    } catch (err) {
      console.error("Status toggle failed:", err.message)
      toast.error(err.message || "Failed to update employee status.")
    }
  }

  // Role change
  const handleRoleChange = async (user, newRole) => {
    if (user.role === newRole) return
    
    const message = `Are you sure you want to change ${user.full_name}'s role to ${newRole}?`
    if (!window.confirm(message)) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name}'s role updated to ${newRole}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } catch (err) {
      console.error("Role update failed:", err.message)
      toast.error(err.message || "Failed to update employee role.")
    }
  }

  // Department change
  const handleDepartmentChange = async (user, departmentId) => {
    const deptName = departments.find(d => d.id === departmentId)?.name || ''
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: departmentId || null })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name} assigned to ${deptName || 'Unassigned'}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, department_id: departmentId || null, departments: { id: departmentId, name: deptName } } : u))
    } catch (err) {
      console.error('Department assign failed:', err.message)
      toast.error(err.message || 'Failed to assign department.')
    }
  }

  // Admin can change Shift Category (Straight Day vs Shift vs Standard)
  const handleCategoryChange = async (user, newCategory) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ category: newCategory || null })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name}'s Shift Category updated to ${newCategory || 'Standard'}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, category: newCategory || null } : u))
    } catch (err) {
      console.error("Shift Category update failed:", err.message)
      toast.error(err.message || "Failed to update Shift Category.")
    }
  }

  // Admin can edit full name
  const handleFullNameEdit = async (user) => {
    const newName = window.prompt(`Enter new full name for ${user.full_name}:`, user.full_name || '')
    if (newName === null || !newName.trim() || newName.trim() === user.full_name) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: newName.trim() })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name}'s name updated to ${newName.trim()}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, full_name: newName.trim() } : u))
    } catch (err) {
      console.error("Full name update failed:", err.message)
      toast.error(err.message || "Failed to update name.")
    }
  }

  // Admin can edit Staff ID
  const handleStaffIdEdit = async (user) => {
    const newStaffId = window.prompt(`Enter new Staff ID for ${user.full_name}:`, user.staff_id || '')
    if (newStaffId === null || newStaffId.trim() === user.staff_id) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ staff_id: newStaffId.trim() || null })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name}'s Staff ID updated to ${newStaffId.trim() || 'N/A'}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, staff_id: newStaffId.trim() || null } : u))
    } catch (err) {
      console.error("Staff ID update failed:", err.message)
      toast.error(err.message || "Failed to update Staff ID.")
    }
  }

  // Admin can change position
  const handlePositionEdit = async (user) => {
    const newPos = window.prompt(`Enter new position for ${user.full_name}:`, user.position || '')
    if (newPos === null || newPos.trim() === user.position) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ position: newPos.trim() || null })
        .eq('id', user.id)

      if (error) throw error

      toast.success(`${user.full_name}'s position updated to ${newPos.trim() || 'N/A'}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, position: newPos.trim() || null } : u))
    } catch (err) {
      console.error("Position update failed:", err.message)
      toast.error(err.message || "Failed to update position.")
    }
  }

  // Admin can edit Date of Engagement (DOE)
  const handleDoeEdit = async (user) => {
    const current = user.date_of_engagement || ''
    const newDoe = window.prompt(`Enter Date of Engagement (YYYY-MM-DD) for ${user.full_name}:`, current)
    if (newDoe === null) return
    const cleaned = newDoe.trim() || null
    if (cleaned && !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      toast.error('Invalid date format. Please use YYYY-MM-DD (e.g. 2022-03-15).')
      return
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ date_of_engagement: cleaned })
        .eq('id', user.id)
      if (error) throw error
      toast.success(`${user.full_name}'s DOE updated.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, date_of_engagement: cleaned } : u))
    } catch (err) {
      console.error('DOE update failed:', err.message)
      toast.error(err.message || 'Failed to update Date of Engagement.')
    }
  }

  // Admin can change Origin / Native Status
  const handleNativeStatusChange = async (user, newStatus) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ native_status: newStatus })
        .eq('id', user.id)
      if (error) throw error
      toast.success(`${user.full_name}'s Origin updated to ${newStatus}.`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, native_status: newStatus } : u))
    } catch (err) {
      console.error('Native status update failed:', err.message)
      toast.error(err.message || 'Failed to update origin status.')
    }
  }

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#006939]/10 text-[#006939] border border-[#006939]/20 uppercase"><Shield size={10} /> Admin</span>
      case 'supervisor':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-150 uppercase"><Award size={10} /> Supervisor</span>
      case 'rep':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDB913]/10 text-[#004D2A] border border-[#FDB913]/30 uppercase"><UserCheck size={10} /> Rep</span>
      case 'employee':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 uppercase">Employee</span>
      default:
        return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-150 text-gray-700">{role}</span>
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="flex items-end gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('directory')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl border border-b-0 transition-all ${
            activeTab === 'directory'
              ? 'bg-white text-[#006939] border-gray-200 shadow-xs -mb-px z-10'
              : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Users size={16} />
          <span>User &amp; Employee Directory</span>
        </button>

        {profile?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('supervisors')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl border border-b-0 transition-all ${
              activeTab === 'supervisors'
                ? 'bg-white text-[#006939] border-gray-200 shadow-xs -mb-px z-10'
                : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <Mail size={16} className="text-[#006939]" />
            <span>Supervisor &amp; Admin Email Routing</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black">
              M365
            </span>
          </button>
        )}

        {profile?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('extra-hours')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl border border-b-0 transition-all ${
              activeTab === 'extra-hours'
                ? 'bg-white text-[#006939] border-gray-200 shadow-xs -mb-px z-10'
                : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <Clock4 size={15} />
            <span>Extra Hours</span>
          </button>
        )}
      </div>

      {/* ── Extra Hours Tab ──────────────────────────────────────────────── */}
      {activeTab === 'extra-hours' && profile?.role === 'admin' && (
        <ExtraHoursPage />
      )}

      {/* ── Supervisor & Admin Email Routing Tab ─────────────────────────── */}
      {activeTab === 'supervisors' && profile?.role === 'admin' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-6 rounded-3xl border border-emerald-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#006939] flex items-center gap-1.5">
                  <ShieldCheck size={16} />
                  Microsoft 365 Email Routing
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 uppercase tracking-tight mt-1">
                  Supervisor &amp; Admin Email Accounts
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
                  Configure the destination email addresses for Department Supervisors and System Admins. When an employee requests leave, the automated notification email with the <strong>1-click approval link</strong> is delivered directly to their Microsoft 365 inbox.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenTestModal}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white text-xs font-bold transition-all shadow-xs"
                  title="Test email delivery via Resend.com or Microsoft 365"
                >
                  <Send size={13} />
                  <span>Test Email Connection</span>
                </button>
                <button
                  onClick={fetchUsers}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all shadow-xs"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>

          {/* Department Supervisor Table */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Building2 size={18} className="text-[#006939]" />
                  Department Supervisors &amp; Notification Emails
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Leave applications from employees in these departments will be emailed to the supervisor below.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-600 border-b border-gray-200 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4">Assigned Supervisor</th>
                    <th className="px-6 py-4">M365 Notification Email</th>
                    <th className="px-6 py-4">Email Routing Status</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {departments.map((dept) => {
                    const assignedSups = departmentSupervisorMap.get(dept.id) || []
                    const primarySup = assignedSups[0]
                    const hasEmail = Boolean(primarySup?.email && primarySup.email.includes('@'))

                    return (
                      <tr key={dept.id} className="hover:bg-gray-50/70 transition-colors">
                        {/* Department Name */}
                        <td className="px-6 py-4 font-bold text-gray-900">
                          {dept.name}
                        </td>

                        {/* Assigned Supervisor */}
                        <td className="px-6 py-4">
                          {primarySup ? (
                            <div>
                              <p className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                                <Award size={14} className="text-blue-600" />
                                {primarySup.full_name}
                              </p>
                              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                                Staff ID: {primarySup.staff_id || 'N/A'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-semibold inline-block">
                              No supervisor assigned
                            </span>
                          )}
                        </td>

                        {/* M365 Email */}
                        <td className="px-6 py-4">
                          {primarySup ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono font-medium ${hasEmail ? 'text-gray-800' : 'text-rose-600 italic'}`}>
                                {primarySup.email || 'No email specified'}
                              </span>
                              <button
                                onClick={() => handleOpenEmailEdit(primarySup)}
                                className="p-1 text-gray-400 hover:text-[#006939] hover:bg-emerald-50 rounded transition-colors"
                                title="Edit supervisor email"
                              >
                                <Edit2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Routes to Admin fallback</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          {primarySup && hasEmail ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={12} className="text-[#006939]" />
                              Active (Direct M365)
                            </span>
                          ) : primarySup && !hasEmail ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertCircle size={12} className="text-amber-600" />
                              Needs Email
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                              Admin Fallback
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleOpenAssignModal(dept)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-[#006939] text-gray-700 hover:text-white text-xs font-bold transition-all shadow-xs"
                          >
                            <Edit2 size={12} />
                            <span>{primarySup ? 'Change / Update' : 'Assign Supervisor'}</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* System Administrator Fallbacks Table */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Shield size={18} className="text-[#006939]" />
                  System Administrators (Fallback Recipients)
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  If an employee requests leave from a department without an assigned supervisor, the approval email is delivered to these Administrator accounts.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-600 border-b border-gray-200 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Administrator</th>
                    <th className="px-6 py-4">Staff ID</th>
                    <th className="px-6 py-4">M365 Notification Email</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminUsers.map((admin) => (
                    <tr key={admin.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-2">
                        <Shield size={14} className="text-[#006939]" />
                        <span>{admin.full_name}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">
                        {admin.staff_id || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-gray-800">
                            {admin.email || 'No email specified'}
                          </span>
                          <button
                            onClick={() => handleOpenEmailEdit(admin)}
                            className="p-1 text-gray-400 hover:text-[#006939] hover:bg-emerald-50 rounded transition-colors"
                            title="Edit admin email"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 size={12} className="text-[#006939]" />
                          Active Admin
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleOpenEmailEdit(admin)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-[#006939] text-gray-700 hover:text-white text-xs font-bold transition-all shadow-xs"
                        >
                          <Edit2 size={12} />
                          <span>Update Email</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Directory Tab ────────────────────────────────────────────────── */}
      {activeTab === 'directory' && (
      <>
      {/* Directory Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            User &amp; Employee Directory
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Manage system operators (Users) and subjects (Employees). Assign roles, departments, DOE, and notification emails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/users/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#006939] hover:bg-[#004D2A] text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.98]"
          >
            <PlusCircle size={15} />
            <span>New User / Employee</span>
          </Link>
        </div>
      </div>

      {/* Search & Role Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative rounded-xl shadow-xs w-full max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search size={15} />
          </div>
          <input
            type="text"
            placeholder="Search by name, email, or Staff ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 bg-gray-50/50 border border-gray-300 rounded-xl text-xs text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#006939]"
          >
            <option value="all">All Roles ({users.length})</option>
            <option value="supervisor">Supervisors ({users.filter(u => u.role === 'supervisor').length})</option>
            <option value="admin">Admins ({users.filter(u => u.role === 'admin').length})</option>
            <option value="rep">Reps ({users.filter(u => u.role === 'rep').length})</option>
            <option value="employee">Employees ({users.filter(u => u.role === 'employee').length})</option>
          </select>

          <div className="text-xs font-semibold text-gray-400 whitespace-nowrap">
            Showing <strong className="text-gray-700">{filteredUsers.length}</strong>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 size={32} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-semibold">Loading users directory...</p>
          </div>
        ) : filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1250px]">
              <thead>
                 <tr className="bg-gray-50/80 text-gray-600 border-b border-gray-200 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-4">Full Name</th>
                  <th className="px-4 py-4">Staff ID</th>
                  <th className="px-4 py-4">Position</th>
                  <th className="px-5 py-4">Shift Category</th>
                  <th className="px-4 py-4">DOE</th>
                  <th className="px-4 py-4">Origin</th>
                  <th className="px-5 py-4">M365 Email</th>
                  <th className="px-4 py-4">Portal Role</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-4 py-4">Login Access</th>
                  <th className="px-4 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/70 transition-colors">
                    {/* Full Name cell with admin edit */}
                    <td className="px-5 py-4 font-semibold text-gray-900 group">
                      <div className="flex items-center gap-2">
                        <span>{user.full_name}</span>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleFullNameEdit(user)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#006939]"
                            title="Edit Full Name"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Staff ID cell with admin edit */}
                    <td className="px-4 py-4 font-bold text-gray-700 font-mono text-xs group">
                      <div className="flex items-center gap-1.5">
                        <span>{user.staff_id || <span className="text-gray-400 font-sans italic">N/A</span>}</span>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleStaffIdEdit(user)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#006939]"
                            title="Edit Staff ID"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Position cell with admin edit */}
                    <td className="px-4 py-4 text-gray-600 text-xs group">
                      <div className="flex items-center gap-1.5">
                        <span>{user.position || <span className="text-gray-400 italic">N/A</span>}</span>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handlePositionEdit(user)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#006939]"
                            title="Edit Position"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Shift Category cell (Straight Day vs Shift vs Standard) */}
                    <td className="px-5 py-4 font-medium text-gray-600">
                      {profile?.role === 'admin' ? (
                        <select
                          value={user.category || ''}
                          onChange={e => handleCategoryChange(user, e.target.value)}
                          className="block w-full min-w-[130px] text-xs py-1.5 px-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#006939] font-medium"
                        >
                          <option value="">Standard</option>
                          <option value="Straight Day">Straight Day</option>
                          <option value="Shift">Shift</option>
                        </select>
                      ) : (
                        user.category === 'Shift' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E1F5FE] text-[#0288D1] border border-[#B3E5FC]">
                            Shift
                          </span>
                        ) : user.category === 'Straight Day' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FFFDE7] text-[#F57F17] border border-[#FFF9C4]">
                            Straight Day
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {user.category || 'Standard'}
                          </span>
                        )
                      )}
                    </td>

                    {/* DOE (Date of Engagement) cell */}
                    <td className="px-4 py-4 text-xs font-mono text-gray-700 group">
                      <div className="flex items-center gap-1.5">
                        <span>{user.date_of_engagement || <span className="text-gray-400 font-sans italic">Not set</span>}</span>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleDoeEdit(user)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#006939]"
                            title="Edit Date of Engagement (YYYY-MM-DD)"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Origin (Native / Non-Native) cell */}
                    <td className="px-4 py-4">
                      {profile?.role === 'admin' ? (
                        <select
                          value={user.native_status || 'Native'}
                          onChange={e => handleNativeStatusChange(user, e.target.value)}
                          className="block w-full min-w-[110px] text-xs py-1.5 px-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#006939] font-medium"
                        >
                          <option value="Native">Native (21d)</option>
                          <option value="Non-Native">Non-Native (24d)</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          user.native_status === 'Non-Native'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {user.native_status || 'Native'}
                        </span>
                      )}
                    </td>

                    {/* M365 Email with direct edit button */}
                    <td className="px-5 py-4 text-gray-700 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-gray-400 shrink-0" />
                        <span className={`text-xs font-mono ${user.email ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                          {user.email || 'No email'}
                        </span>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleOpenEmailEdit(user)}
                            className="p-1 text-gray-400 hover:text-[#006939] hover:bg-emerald-50 rounded transition-colors"
                            title="Edit email address for notifications"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Role badge and change */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5 max-w-[130px]">
                        <div>{getRoleBadge(user.role)}</div>
                        {profile?.role === 'admin' && (
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value)}
                            className="block w-full text-xs py-1 px-2 border border-gray-300 rounded-lg text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#006939] font-medium"
                          >
                            <option value="employee">Employee</option>
                            <option value="rep">Rep</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </div>
                    </td>

                    {/* Department cell */}
                    <td className="px-5 py-4 font-medium text-gray-600 text-xs">
                       {profile?.role === 'admin' ? (
                         <select
                           value={user.department_id || ''}
                           onChange={e => handleDepartmentChange(user, e.target.value)}
                           className="block w-full min-w-[140px] text-xs py-1.5 px-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#006939] font-medium"
                         >
                           <option value="">Unassigned</option>
                           {departments.map(dept => (
                             <option key={dept.id} value={dept.id}>{dept.name}</option>
                           ))}
                         </select>
                       ) : (
                         user.departments?.name || <span className="text-gray-300">Unassigned</span>
                       )}
                    </td>

                    {/* Access switch status */}
                    <td className="px-4 py-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                          Suspended
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`p-1 rounded-lg transition-colors ${user.is_active ? 'text-[#006939] hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                          title={user.is_active ? "Suspend account access" : "Activate account access"}
                        >
                          {user.is_active ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                        </button>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleDelete(user)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                            title="Delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3">
            <FolderOpen size={48} className="text-gray-300" />
            <p className="text-sm font-semibold">No registered users matched your criteria.</p>
          </div>
        )}
      </div>
      </>
      )}

      {/* ── EMAIL EDIT MODAL ──────────────────────────────────────────────── */}
      {emailModalOpen && selectedUserForEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={20} className="text-[#FDB913]" />
                <h3 className="font-bold text-base">
                  Update Notification Email
                </h3>
              </div>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEmail} className="p-6 space-y-4">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-950 space-y-1">
                <p><strong>User:</strong> {selectedUserForEmail.full_name}</p>
                <p><strong>Role:</strong> <span className="capitalize">{selectedUserForEmail.role}</span> • <strong>Dept:</strong> {selectedUserForEmail.departments?.name || 'Unassigned'}</p>
                <p className="text-[11px] text-gray-500 pt-1">
                  Leave approval notifications will be delivered to this Microsoft 365 address.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Microsoft 365 Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. kwame.asante@cbi-africa.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] font-medium"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  disabled={savingEmail}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEmail}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {savingEmail && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ASSIGN SUPERVISOR MODAL ───────────────────────────────────────── */}
      {assignModalOpen && assignDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-[#FDB913]" />
                <h3 className="font-bold text-base">
                  Assign Supervisor: {assignDept.name}
                </h3>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupervisorAssignment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Select Colleague to Designate as Supervisor *
                </label>
                <select
                  required
                  value={assignUserId}
                  onChange={(e) => {
                    const selId = e.target.value
                    setAssignUserId(selId)
                    const found = users.find(u => u.id === selId)
                    if (found && found.email) {
                      setAssignEmail(found.email)
                    }
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] bg-white font-medium text-gray-800"
                >
                  <option value="">-- Choose Colleague --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} {u.staff_id ? `(${u.staff_id})` : ''} - Current Role: {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Supervisor Microsoft 365 Email (for Leave Approvals)
                </label>
                <input
                  type="email"
                  placeholder="e.g. supervisor@cbi-africa.com"
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] font-medium"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Every leave request from {assignDept.name} will be emailed here with the 1-click approval link.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  disabled={savingAssignment}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAssignment}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {savingAssignment && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Supervisor</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── TEST EMAIL CONNECTION MODAL ───────────────────────────── */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-gray-100 overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send size={20} className="text-[#FDB913]" />
                <h3 className="font-bold text-base">
                  Test Email Connection (Resend / M365)
                </h3>
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Send a real diagnostic email to verify delivery. The system checks for <strong>Resend.com</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-mono">RESEND_API_KEY</code>) first, or falls back to <strong>Microsoft 365 SMTP</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-mono">M365_SMTP_USER</code>).
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Send Test Email To:
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. your-email@cbi-africa.com"
                  value={testEmailInput}
                  onChange={(e) => setTestEmailInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939] font-medium"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleRunEmailTest}
                  disabled={testingConnection || !testEmailInput.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {testingConnection ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>{testingConnection ? 'Testing Connection...' : 'Send Test Email Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              {/* Diagnostic Results Box */}
              {testResult && (
                <div className={`mt-4 p-4 rounded-2xl border text-xs space-y-2 ${
                  testResult.success 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {testResult.success ? (
                      <>
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <span>Success! Email Delivered</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={16} className="text-rose-600" />
                        <span>Connection Failed</span>
                      </>
                    )}
                  </div>

                  <p className="font-medium">{testResult.message || testResult.error}</p>

                  {testResult.hint && (
                    <div className="bg-white/80 p-3 rounded-xl border border-rose-200 text-[11px] text-gray-700 space-y-1">
                      <strong>Troubleshooting Tip:</strong>
                      <p className="whitespace-pre-line leading-relaxed">{testResult.hint}</p>
                    </div>
                  )}

                  {testResult.status && (
                    <div className="bg-white/60 p-2.5 rounded-xl font-mono text-[10px] space-y-0.5 text-gray-600 border border-gray-200">
                      <div>User: {testResult.status.m365_smtp_user}</div>
                      <div>Pass: {testResult.status.m365_smtp_pass}</div>
                      <div>Relay: {testResult.status.smtp_host}:{testResult.status.smtp_port}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UsersPage
