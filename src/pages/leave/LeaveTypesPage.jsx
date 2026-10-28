import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../context/AuthContext'
import { isAdmin } from '../../utils/roleHelpers'
import { DEFAULT_LEAVE_TYPES } from '../../utils/leaveHelpers'
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Settings, 
  CalendarDays, 
  AlertCircle, 
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldAlert
} from 'lucide-react'
import toast from 'react-hot-toast'

export const LeaveTypesPage = () => {
  const { profile } = useAuth()
  const [leaveTypes, setLeaveTypes] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null) // null = creating new, object = editing
  const [submitting, setSubmitting] = useState(false)

  // Form inputs
  const [name, setName] = useState('')
  const [defaultDays, setDefaultDays] = useState('15')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Delete confirmation modal state
  const [deleteConfirmType, setDeleteConfirmType] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchLeaveTypes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('leave_types')
        .select('*')
        .order('name')

      if (error) {
        // If table doesn't exist yet, we notify gracefully
        console.warn('leave_types fetch issue:', error.message)
        setLeaveTypes([])
      } else {
        setLeaveTypes(data || [])
      }
    } catch (err) {
      console.error('Error fetching leave types:', err.message)
      toast.error('Could not load leave types.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaveTypes()
  }, [])

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingType(null)
    setName('')
    setDefaultDays('15')
    setDescription('')
    setIsActive(true)
    setIsModalOpen(true)
  }

  // Open modal for Edit
  const handleOpenEdit = (type) => {
    setEditingType(type)
    setName(type.name || '')
    setDefaultDays(String(type.default_days || 0))
    setDescription(type.description || '')
    setIsActive(type.is_active ?? true)
    setIsModalOpen(true)
  }

  // Seed default leave types if empty
  const handleSeedDefaults = async () => {
    if (!isAdmin(profile)) return
    setSubmitting(true)
    try {
      for (const item of DEFAULT_LEAVE_TYPES) {
        await supabase
          .from('leave_types')
          .upsert({
            name: item.name,
            default_days: item.default_days,
            description: item.description,
            is_active: true
          }, { onConflict: 'name' })
      }
      toast.success('Default leave types initialized successfully.')
      fetchLeaveTypes()
    } catch (err) {
      toast.error(err.message || 'Failed to initialize default leave types.')
    } finally {
      setSubmitting(false)
    }
  }

  // Save (Create or Update)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Please enter a leave type name.')
      return
    }

    const daysNum = parseFloat(defaultDays)
    if (isNaN(daysNum) || daysNum < 0) {
      toast.error('Please enter a valid number of days (0 or greater).')
      return
    }

    setSubmitting(true)
    try {
      if (editingType) {
        // Update existing
        const { error } = await supabase
          .from('leave_types')
          .update({
            name: name.trim(),
            default_days: daysNum,
            description: description.trim(),
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingType.id)

        if (error) throw error
        toast.success(`Updated "${name}" successfully.`)
      } else {
        // Create new
        const { error } = await supabase
          .from('leave_types')
          .insert({
            name: name.trim(),
            default_days: daysNum,
            description: description.trim(),
            is_active: isActive
          })

        if (error) throw error
        toast.success(`Created "${name}" with ${daysNum} days.`)
      }

      setIsModalOpen(false)
      fetchLeaveTypes()
    } catch (err) {
      console.error('Save leave type failed:', err.message)
      toast.error(err.message || 'Failed to save leave type.')
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle Active/Inactive
  const handleToggleActive = async (type) => {
    if (!isAdmin(profile)) return
    try {
      const nextStatus = !type.is_active
      const { error } = await supabase
        .from('leave_types')
        .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', type.id)

      if (error) throw error
      toast.success(`"${type.name}" is now ${nextStatus ? 'active' : 'inactive'}.`)
      fetchLeaveTypes()
    } catch (err) {
      toast.error(err.message || 'Failed to toggle status.')
    }
  }

  // Delete
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmType || !isAdmin(profile)) return
    setDeleting(true)
    try {
      // Check if any leave requests use this type
      const { count } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('leave_type_id', deleteConfirmType.id)

      if (count && count > 0) {
        toast.error(`Cannot delete: ${count} leave request(s) are linked to this leave type. You can set it to Inactive instead.`, { duration: 6000 })
        setDeleteConfirmType(null)
        return
      }

      const { error } = await supabase
        .from('leave_types')
        .delete()
        .eq('id', deleteConfirmType.id)

      if (error) throw error
      toast.success(`Deleted leave type "${deleteConfirmType.name}".`)
      setDeleteConfirmType(null)
      fetchLeaveTypes()
    } catch (err) {
      console.error('Delete error:', err.message)
      toast.error(err.message || 'Failed to delete leave type.')
    } finally {
      setDeleting(false)
    }
  }

  if (!isAdmin(profile)) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center font-sans">
        <ShieldAlert size={48} className="mx-auto text-amber-500 mb-3" />
        <h2 className="text-xl font-bold text-gray-800">Admin Privileges Required</h2>
        <p className="text-gray-500 text-sm mt-1">
          Only System Administrators are permitted to configure leave types and standard day allocations.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#006939]/10 text-[#006939]">
              <Settings size={20} />
            </span>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
              Leave Types & Days Configuration
            </h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Configure statutory and company leave categories, standard annual entitlements, and availability rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {leaveTypes.length === 0 && (
            <button
              onClick={handleSeedDefaults}
              disabled={submitting}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#006939] text-[#006939] font-bold text-xs shadow-sm hover:bg-emerald-50 transition-all"
            >
              <Sparkles size={14} className="text-[#FDB913]" />
              <span>Load Default 7 Types</span>
            </button>
          )}

          <button
            onClick={fetchLeaveTypes}
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>Add Leave Type</span>
          </button>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 size={32} className="animate-spin text-[#006939] mx-auto mb-3" />
            <p className="text-sm font-semibold">Loading leave types...</p>
          </div>
        ) : leaveTypes.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-700">No Leave Types Configured</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              Get started by adding your organization's leave policies or load the standard default set.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={handleSeedDefaults}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#006939] text-white font-bold text-xs shadow-md"
              >
                <Sparkles size={14} className="text-[#FDB913]" />
                <span>Initialize Default Types</span>
              </button>
              <button
                onClick={handleOpenCreate}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
              >
                Add Custom Type
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Leave Name</th>
                  <th className="py-3.5 px-6">Annual Entitlement (Days)</th>
                  <th className="py-3.5 px-6">Description</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {leaveTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-900 flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#006939]/80"></div>
                      <span>{type.name}</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-50 text-[#006939] font-extrabold text-sm border border-emerald-100">
                        {type.default_days} <span className="text-[11px] font-normal text-gray-500">days/year</span>
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-600 text-xs max-w-xs truncate">
                      {type.description || <span className="text-gray-400 italic">No description</span>}
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => handleToggleActive(type)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                          type.is_active 
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title="Click to toggle status"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${type.is_active ? 'bg-emerald-600' : 'bg-gray-400'}`}></span>
                        <span>{type.is_active ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(type)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-[#006939] hover:bg-emerald-50 transition-colors"
                          title="Edit Leave Type & Days"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmType(type)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete Leave Type"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-[#FDB913]" />
                <h3 className="font-bold text-base">
                  {editingType ? 'Modify Leave Type & Days' : 'Add New Leave Type'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Leave Type Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Annual Leave, Study Leave"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Standard Entitled Days *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="365"
                    required
                    value={defaultDays}
                    onChange={(e) => setDefaultDays(e.target.value)}
                    placeholder="15"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-400 font-semibold">
                    Days / Year
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Default days granted per calendar year to eligible staff.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Description / Policy Note
                </label>
                <textarea
                  rows="2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Requires approval 5 working days in advance..."
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006939]"
                ></textarea>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-[#006939] rounded border-gray-300 focus:ring-[#006939]"
                />
                <label htmlFor="isActive" className="text-xs font-bold text-gray-700 cursor-pointer">
                  Available for new leave applications (Active)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  <span>{editingType ? 'Save Changes' : 'Create Leave Type'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Delete Leave Type?</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-gray-800">"{deleteConfirmType.name}"</strong>? If historical records exist, deletion will be blocked to preserve audit integrity.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmType(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaveTypesPage

