import React, { useState, useEffect } from 'react'
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
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export const UsersPage = () => {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')

  const [currentUserId, setCurrentUserId] = useState(null)

  // Departments list for admin assignment
  const [departments, setDepartments] = useState([])

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
            name
          )
        `)
        .order('full_name')

      if (searchText.trim()) {
        query = query.or(`full_name.ilike.%${searchText.trim()}%,email.ilike.%${searchText.trim()}%`)
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
    // Load departments for admin assignment
    const loadDepartments = async () => {
      const { data, error } = await supabase.from('departments').select('id, name')
      if (error) console.error('Error loading departments:', error)
      else setDepartments(data || [])
    }
    loadDepartments()
  }, [searchText])

  // Admin delete handler with audit logging
  const handleDelete = async (targetUser) => {
    const confirmMsg = `Are you sure you want to DELETE ${targetUser.full_name} (${targetUser.role})? This action cannot be undone.`
    if (!window.confirm(confirmMsg)) return

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', targetUser.id)
      if (error) throw error

      // Audit log entry
      await supabase.from('audit_logs').insert({
        action: 'delete_user',
        performed_by: profile?.id,
        performed_at: new Date().toISOString(),
        details: { id: targetUser.id, role: targetUser.role }
      })

      toast.success(`${targetUser.full_name} has been deleted.`)
      // Remove from local state
      setUsers(prev => prev.filter(u => u.id !== targetUser.id))
    } catch (err) {
      console.error('Delete failed:', err.message)
      toast.error(err.message || 'Failed to delete user/employee.')
    }
  }

  // Existing toggle status handler remains unchanged
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
      
      // Update state locally
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: updatedStatus } : u))
    } catch (err) {
      console.error("Status toggle failed:", err.message)
      toast.error(err.message || "Failed to update employee status.")
    }
  }

  // Change user role
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

      toast.success(`${user.full_name}'s role has been updated to ${newRole}.`)
      
      // Update state locally
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } catch (err) {
      console.error("Role update failed:", err.message)
      toast.error(err.message || "Failed to update employee role.")
    }
  }

  // Admin can assign department to Rep or Supervisor
  const handleDepartmentChange = async (user, departmentId) => {
    const deptName = departments.find(d => d.id === departmentId)?.name || ''
    const message = `Assign ${user.full_name} to department ${deptName || 'Unassigned'}?`
    if (!window.confirm(message)) return
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: departmentId || null })
        .eq('id', user.id)
        
      if (error) throw error
      
      toast.success(`${user.full_name} assigned to ${deptName || 'Unassigned'}.`)
      // Update local state
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, departments: departmentId ? { id: departmentId, name: deptName } : null, department_id: departmentId } : u))
    } catch (err) {
      console.error('Department assign failed:', err.message)
      toast.error(err.message || 'Failed to assign department.')
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
      {/* Directory Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            User & Employee Directory
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Manage system operators (Users) and subjects (Employees). Assign roles, departments, and lock deactivated accounts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/users/new"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm shadow-sm transition-all active:scale-[0.98] shrink-0 font-sans"
          >
            <PlusCircle size={16} />
            <span>Onboard New User</span>
          </Link>
          <Link
            to="/employees/new"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] shrink-0 font-sans"
          >
            <PlusCircle size={16} />
            <span>Onboard New Employee</span>
          </Link>
        </div>
      </div>

      {/* Search Header panel */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between gap-4">
        <div className="relative rounded-lg shadow-sm w-full max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Search size={14} />
          </div>
          <input
            type="text"
            placeholder="Search by Employee name or email..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 bg-[#F3F4F6] border border-gray-200 rounded-lg text-xs text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006939] focus:bg-white transition-all"
          />
        </div>
        <div className="text-xs font-semibold text-gray-400">
          Total: <span className="text-gray-700">{users.length} registered</span>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            {[1, 2, 3].map(idx => (
              <div key={idx} className="flex gap-4 h-12 items-center border-b border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              </div>
            ))}
          </div>
        ) : users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                 <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Full Name</th>
                  <th className="px-6 py-4">Staff ID</th>
                  <th className="px-6 py-4">Position</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Portal Role</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Login Access</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-[#E8F5EE]/10 transition-colors">
                    {/* Name cell */}
                    <td className="px-6 py-4 font-semibold text-[#1A1A1A]">
                      {user.full_name}
                    </td>

                    {/* Staff ID cell */}
                    <td className="px-6 py-4 font-bold text-gray-700">
                      {user.staff_id || <span className="text-gray-400 text-xs font-normal italic">N/A</span>}
                    </td>

                    {/* Position cell */}
                    <td className="px-6 py-4 text-gray-600">
                      {user.position || <span className="text-gray-400 text-xs font-normal italic">N/A</span>}
                    </td>

                    {/* Category cell */}
                    <td className="px-6 py-4">
                      {user.category === 'Shift' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E1F5FE] text-[#0288D1] border border-[#B3E5FC]">
                          Shift
                        </span>
                      ) : user.category === 'Straight Day' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FFFDE7] text-[#F57F17] border border-[#FFF9C4]">
                          Straight Day
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {user.category || 'Standard'}
                        </span>
                      )}
                    </td>

                    {/* Email cell */}
                    <td className="px-6 py-4 text-gray-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Mail size={14} className="text-gray-400" />
                        <span>{user.email}</span>
                      </div>
                    </td>

                    {/* Role badge and change */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <div>{getRoleBadge(user.role)}</div>
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user, e.target.value)}
                          className="block w-full text-xs py-1 px-2 border border-gray-200 rounded text-gray-600 bg-gray-50 focus:outline-none focus:border-[#006939] focus:ring-1 focus:ring-[#006939]"
                        >
                          <option value="employee">Employee</option>
                          <option value="rep">Rep</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </td>

                    {/* Department cell */}
                    <td className="px-6 py-4 font-medium text-gray-600">
                       {profile?.role === 'admin' ? (
                         <select
                           value={user.department_id || ''}
                           onChange={e => handleDepartmentChange(user, e.target.value)}
                           className="block w-full text-xs py-1 px-2 border border-gray-200 rounded bg-gray-50 focus:outline-none focus:border-[#006939] focus:ring-1 focus:ring-[#006939]"
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
                    <td className="px-6 py-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#D1FAE5] text-[#065F46] border border-[#059669]">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-850 border border-red-200">
                          Suspended
                        </span>
                      )}
                    </td>

                    {/* Toggle controller */}
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className={`p-1 rounded-lg transition-colors duration-150 ${user.is_active ? 'text-[#006939] hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                        title={user.is_active ? "Click to suspend account access" : "Click to activate account access"}
                      >
                        {user.is_active ? (
                          <ToggleRight size={28} className="stroke-[1.5]" />
                        ) : (
                          <ToggleLeft size={28} className="stroke-[1.5]" />
                        )}
                      </button>
                      {/* Admin Delete Button */}
                      {profile?.role === 'admin' && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="ml-2 text-red-600 hover:text-red-800"
                          title="Delete user/employee"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
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
    </div>
  )
}

export default UsersPage
