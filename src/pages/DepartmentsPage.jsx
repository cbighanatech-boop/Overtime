import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { 
  FolderTree, 
  Plus, 
  Edit, 
  Trash2, 
  FolderLock, 
  AlertTriangle,
  X, 
  Save, 
  Users, 
  FileText,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'

export const DepartmentsPage = () => {
  // State Management
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Modals state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState(null) // null = create mode, object = edit mode
  const [deptName, setDeptName] = useState('')

  // Fetch departments joined with child arrays to check count & reference integrity
  const fetchDepartments = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('departments')
        .select(`
          *,
          profiles (
            id
          ),
          overtime_records (
            id
          )
        `)
        .order('name')

      if (error) throw error

      setDepartments(data || [])
    } catch (err) {
      console.error("Error loading departments list:", err.message)
      toast.error("Failed to load departments roster.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDepartments()
  }, [])

  // Open modal for Creating
  const handleOpenCreate = () => {
    setEditingDept(null)
    setDeptName('')
    setModalOpen(true)
  }

  // Open modal for Editing
  const handleOpenEdit = (dept) => {
    setEditingDept(dept)
    setDeptName(dept.name)
    setModalOpen(true)
  }

  // Handle Create or Update save
  const handleSave = async (e) => {
    e.preventDefault()

    if (!deptName.trim()) {
      toast.error("Department name cannot be empty.")
      return
    }

    setSubmitting(true)
    try {
      if (editingDept) {
        // Edit Mode
        const { error } = await supabase
          .from('departments')
          .update({ name: deptName.trim() })
          .eq('id', editingDept.id)

        if (error) throw error
        toast.success(`Department renamed to "${deptName.trim()}"!`)
      } else {
        // Create Mode
        const { error } = await supabase
          .from('departments')
          .insert({ name: deptName.trim() })

        if (error) throw error
        toast.success(`Department "${deptName.trim()}" created successfully!`)
      }

      setModalOpen(false)
      fetchDepartments()
    } catch (err) {
      console.error("Save failed:", err.message)
      toast.error(err.message || "Failed to save department details.")
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Deletion with strict Reference Safety Locks (Part 13)
  const handleDelete = async (dept) => {
    const activeStaffCount = dept.profiles?.length || 0
    const overtimeRecordsCount = dept.overtime_records?.length || 0

    // Safety Locks validation
    if (activeStaffCount > 0 || overtimeRecordsCount > 0) {
      toast.error(
        <div>
          <p className="font-bold">Deletion Blocked (Reference Lock)</p>
          <p className="text-xs mt-0.5">
            This department is linked to <strong>{activeStaffCount}</strong> employee(s) and <strong>{overtimeRecordsCount}</strong> overtime record(s). 
            Please re-assign or delete all linked references before removal.
          </p>
        </div>,
        { duration: 6000, id: 'safety-lock-toast' }
      )
      return
    }

    if (!window.confirm(`Are you sure you want to delete the department "${dept.name}"?`)) return

    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', dept.id)

      if (error) throw error

      toast.success(`Department "${dept.name}" deleted successfully.`)
      fetchDepartments()
    } catch (err) {
      console.error("Delete failed:", err.message)
      toast.error(err.message || "Failed to delete department.")
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Department Hub
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Create, rename and manage business departments, governed by database reference integrity locks.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] shrink-0 font-sans"
        >
          <Plus size={16} />
          <span>Add Department</span>
        </button>
      </div>

      {/* Grid of departments */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-pulse">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-40">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="h-8 bg-gray-100 rounded-xl mt-6"></div>
            </div>
          ))}
        </div>
      ) : departments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {departments.map((dept) => {
            const staffCount = dept.profiles?.length || 0
            const recordsCount = dept.overtime_records?.length || 0
            const hasReferences = staffCount > 0 || recordsCount > 0

            return (
              <div 
                key={dept.id} 
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative overflow-hidden flex flex-col justify-between h-44 hover:shadow-md transition-all group"
              >
                {/* Border Indicator */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#006939] group-hover:h-1.5 transition-all"></div>

                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-md font-bold text-[#1A1A1A] font-sans truncate" title={dept.name}>
                      {dept.name}
                    </h3>
                    
                    {/* Access Locks indicator badge */}
                    {hasReferences ? (
                      <span className="p-1 rounded-md bg-amber-50 text-[#E0A200] border border-amber-250 flex items-center" title="Deletion Locked: Active references present">
                        <FolderLock size={14} />
                      </span>
                    ) : (
                      <span className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center" title="Delete Allowed: No active references">
                        <FolderTree size={14} />
                      </span>
                    )}
                  </div>
                  
                  {/* Department stats */}
                  <div className="flex gap-4 mt-4 text-xs font-semibold text-gray-500">
                    <div className="flex items-center gap-1">
                      <Users size={14} className="text-gray-400" />
                      <span>{staffCount} Staff</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText size={14} className="text-gray-400" />
                      <span>{recordsCount} Entries</span>
                    </div>
                  </div>
                </div>

                {/* Operations Footer */}
                <div className="border-t border-gray-50 pt-4 flex justify-between items-center mt-4">
                  <span className="text-[10px] text-gray-400">
                    Created {new Date(dept.created_at).toLocaleDateString()}
                  </span>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(dept)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-[#006939] transition-colors"
                      title="Rename Department"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(dept)}
                      className={`p-1.5 rounded-md transition-colors ${hasReferences ? 'text-gray-300 cursor-not-allowed hover:bg-transparent' : 'hover:bg-red-50 text-red-400 hover:text-red-600'}`}
                      title={hasReferences ? "Locked: active references prevent deletion" : "Delete Department"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-gray-400 gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <FolderTree size={56} className="text-gray-300" />
          <p className="text-sm font-semibold">No departments found. Create one to get started.</p>
        </div>
      )}

      {/* -------------------------------------------------------------
          CREATE & EDIT MODAL
         ------------------------------------------------------------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
          <div onClick={() => setModalOpen(false)} className="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden z-10 animate-scale-up relative">
            
            {/* Header */}
            <div className="bg-[#006939] px-6 py-4 flex items-center justify-between text-white">
              <h3 className="text-sm font-bold uppercase tracking-wider">
                {editingDept ? "Rename Department" : "Add Department"}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-white/80 hover:text-white rounded-full p-1 hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave}>
              <div className="p-6 space-y-4">
                {/* Warning Alert if editing */}
                {editingDept && editingDept.overtime_records?.length > 0 && (
                  <div className="flex gap-2.5 bg-amber-50 border border-amber-250 p-3 rounded-lg text-amber-800 text-xs">
                    <AlertTriangle className="h-4 w-4 text-[#FDB913] shrink-0" />
                    <p>Renaming this department will automatically update it for all {editingDept.overtime_records.length} associated overtime logs.</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2">
                    Department Name
                  </label>
                  <input
                    type="text"
                    required
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder="e.g. Finance, Assembly, QA"
                    className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all placeholder-gray-400 font-medium"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center gap-1.5 px-5 py-2 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Save size={14} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default DepartmentsPage
