import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import { 
  ArrowLeft, 
  Save, 
  User, 
  FolderCheck,
  Loader2,
  CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'

export const NewEmployeePage = () => {
  const navigate = useNavigate()
  const { profile: currentUser } = useAuth()
  const isCurrentUserAdmin = currentUser?.role === 'admin'
  const backPath = isCurrentUserAdmin ? '/users' : '/records'

  // Loading States
  const [loadingDepts, setLoadingDepts] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [departments, setDepartments] = useState([])

  // Form Fields State
  const [fullName, setFullName] = useState('')
  const [staffId, setStaffId] = useState('')
  const [category, setCategory] = useState('Shift')
  const [position, setPosition] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  // Load departments for select dropdown
  useEffect(() => {
    const fetchDepartments = async () => {
      setLoadingDepts(true)
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('*')
          .order('name')
        if (error) throw error
        setDepartments(data || [])
        if (data && data.length > 0) {
          setDepartmentId(data[0].id)
        }
      } catch (err) {
        console.error("Error loading departments:", err.message)
        toast.error("Failed to load departments dropdown.")
      } finally {
        setLoadingDepts(false)
      }
    }
    fetchDepartments()
  }, [])

  // Handle employee creation
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!fullName.trim() || !staffId.trim()) {
      toast.error("Please fill in all required fields.")
      return
    }
    if (!departmentId) {
      toast.error("Please select a department.")
      return
    }

    setSubmitting(true)
    try {
      // 1. Generate unique simulated user ID and dummy email for employees since they don't log in
      const newUserId = `emp-${Math.random().toString(36).substr(2, 9)}`
      const dummyEmail = `emp-${newUserId}@cbi-overtime.local`

      // 2. Save directly to local database profiles list
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newUserId,
          email: dummyEmail,
          password: 'NoLogin123!', // They won't log in
          full_name: fullName.trim(),
          staff_id: staffId.trim(),
          category: category,
          position: position.trim(),
          role: 'employee',
          department_id: departmentId,
          is_active: true
        })

      if (profileError) throw profileError

      toast.success(`${fullName} has been created as an Employee!`, {
        icon: <CheckCircle2 className="text-[#006939]" />
      })
      
      // Redirect back
      navigate(backPath)
    } catch (err) {
      console.error("Creation failed:", err.message)
      toast.error(err.message || "Failed to create new employee.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 font-sans">
      {/* Breadcrumbs header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Onboard New Employee
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Register a new employee whose overtime hours will be captured. They will not have login access.
          </p>
        </div>
      </div>

      {/* Onboarding form card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]"></div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl text-xs space-y-1">
            <p className="font-bold uppercase tracking-wider">Employee Notice</p>
            <p className="text-blue-700 leading-relaxed">
              Employees added here are subjects for overtime tracking and cannot log into the system.
            </p>
          </div>

          {/* Full Name input */}
          <div>
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User size={14} />
              <span>Full Name</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Richmond Appiah"
              className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all placeholder-gray-400 font-medium"
              disabled={submitting}
            />
          </div>

          {/* Staff ID & Category splits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Staff ID */}
            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User size={14} />
                <span>Staff ID</span>
              </label>
              <input
                type="text"
                required
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="e.g. CBI-008"
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all placeholder-gray-400 font-medium"
                disabled={submitting}
              />
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User size={14} />
                <span>Position</span>
              </label>
              <input
                type="text"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. Plant Operator"
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all placeholder-gray-400 font-medium"
                disabled={submitting}
              />
            </div>

            {/* Category select */}
            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User size={14} />
                <span>Shift Category</span>
              </label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                disabled={submitting}
              >
                <option value="Shift">Shift</option>
                <option value="Straight Day">Straight Day</option>
              </select>
            </div>
          </div>

          {/* Department select */}
          <div>
            <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FolderCheck size={14} />
              <span>Department</span>
            </label>
            {loadingDepts ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
            ) : (
              <select
                required
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                disabled={submitting}
              >
                <option value="">-- Choose Department --</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Action Panel Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3.5">
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors w-full sm:w-auto"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] w-full sm:w-auto disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Onboarding Employee...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Onboard Employee</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default NewEmployeePage
