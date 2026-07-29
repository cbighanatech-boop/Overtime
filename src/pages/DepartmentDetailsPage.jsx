import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { 
  ArrowLeft, 
  Users, 
  Mail, 
  Shield, 
  Activity,
  Calendar,
  Loader2,
  FolderOpen,
  Eye
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import EmployeeDetailsModal from '../components/departments/EmployeeDetailsModal'

export const DepartmentDetailsPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()

  // State Management
  const [department, setDepartment] = useState(null)
  const [staffMembers, setStaffMembers] = useState([])
  const [loading, setLoading] = useState(true)

  // Selected Employee Modal State
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Fetch department and all assigned staff
  const fetchDepartmentDetails = async () => {
    setLoading(true)
    try {
      // Fetch department info
      const { data: deptData, error: deptErr } = await supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .single()

      if (deptErr) throw deptErr

      setDepartment(deptData)

      // Fetch all staff members assigned to this department
      const { data: staffData, error: staffErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('department_id', id)
        .order('full_name')

      if (staffErr) throw staffErr

      setStaffMembers(staffData || [])
    } catch (err) {
      console.error("Error loading department details:", err.message)
      toast.error("Failed to load department details.")
      navigate('/departments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDepartmentDetails()
  }, [id])

  const handleOpenEmployeeDossier = (member) => {
    setSelectedEmployee(member)
    setModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#006939]"></div>
          <p className="text-xs text-gray-500 font-sans font-semibold">Loading department details...</p>
        </div>
      </div>
    )
  }

  if (!department) return null

  // Role badge styling
  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return {
          bg: 'bg-purple-50',
          border: 'border-purple-200',
          text: 'text-purple-700',
          label: 'Admin'
        }
      case 'supervisor':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          label: 'Supervisor'
        }
      case 'rep':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          text: 'text-emerald-700',
          label: 'Representative'
        }
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          label: role || 'Employee'
        }
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans">
      {/* Header Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/departments')}
          className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            {department.name}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            View all assigned users and employees. Click any name to pull complete employee data & overtime hours.
          </p>
        </div>
      </div>

      {/* Department Summary Card */}
      <div className="bg-gradient-to-r from-[#006939] to-[#004D2A] rounded-2xl shadow-xl p-8 text-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/10 rounded-2xl">
              <Users size={32} className="text-[#FDB913]" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Total Staff</p>
              <p className="text-4xl font-[900] text-white mt-1">{staffMembers.length}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Department Created</p>
            <p className="text-sm font-semibold text-white mt-3">
              {department.created_at ? format(parseISO(department.created_at), 'MMMM dd, yyyy') : 'N/A'}
            </p>
          </div>

          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Department ID</p>
            <p className="text-sm font-mono text-white/80 mt-3">{department.id.slice(0, 12)}...</p>
          </div>
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#006939] uppercase tracking-wider">
            Assigned Users & Employees ({staffMembers.length})
          </h3>
          <span className="text-xs text-gray-500 font-semibold italic">
            Click an employee's name to view overtime history
          </span>
        </div>

        {staffMembers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staffMembers.map((member) => {
                  const roleBadge = getRoleBadge(member.role)
                  return (
                    <tr key={member.id} className="hover:bg-emerald-50/30 transition-colors">
                      {/* Name - Clickable */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleOpenEmployeeDossier(member)}
                          className="font-bold text-[#006939] hover:text-[#004D2A] hover:underline flex items-center gap-2 group text-left transition-colors focus:outline-none"
                          title="Click to view employee profile & overtime history"
                        >
                          <span>{member.full_name}</span>
                          <Eye size={14} className="opacity-0 group-hover:opacity-100 text-[#006939] transition-opacity shrink-0" />
                        </button>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-gray-400" />
                          <span className="text-gray-600 text-xs">{member.email}</span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${roleBadge.bg} ${roleBadge.border} ${roleBadge.text}`}>
                          {roleBadge.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${member.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                          <span className={`text-xs font-semibold ${member.is_active ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {member.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>

                      {/* Joined Date */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-gray-400" />
                          <span className="text-gray-600 text-xs">
                            {member.created_at ? format(parseISO(member.created_at), 'MMM dd, yyyy') : 'N/A'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3">
            <FolderOpen size={48} className="text-gray-300" />
            <p className="text-sm font-semibold">No staff members assigned to this department yet.</p>
          </div>
        )}
      </div>

      {/* Employee Details & Overtime Dossier Modal */}
      <EmployeeDetailsModal
        employee={selectedEmployee}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setSelectedEmployee(null)
        }}
        departmentName={department?.name}
      />
    </div>
  )
}

export default DepartmentDetailsPage

