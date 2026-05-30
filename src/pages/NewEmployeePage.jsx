import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import {
  ArrowLeft,
  Save,
  User,
  FolderCheck,
  Loader2,
  CheckCircle2,
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Users,
  ChevronRight,
  Info,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────────────────────────
const VALID_CATEGORIES = ['Shift', 'Straight Day']
const TEMPLATE_HEADERS = ['full_name', 'staff_id', 'position', 'category']
const TEMPLATE_SAMPLE = [
  { full_name: 'Jane Doe', staff_id: 'CBI-010', position: 'Plant Operator', category: 'Shift' },
  { full_name: 'Kweku Asante', staff_id: 'CBI-011', position: 'Technician', category: 'Straight Day' },
]

// ─── Helper: validate a single parsed row ─────────────────────────────────
function validateRow(row, index, existingStaffIds, seenInBatch) {
  const errors = []

  const fullName = String(row.full_name || '').trim()
  const staffId = String(row.staff_id || '').trim()
  const position = String(row.position || '').trim()
  const category = String(row.category || '').trim()

  if (!fullName) errors.push('Full name is required')
  if (!staffId) {
    errors.push('Staff ID is required')
  } else if (existingStaffIds.has(staffId)) {
    errors.push(`Staff ID "${staffId}" already exists in the database`)
  } else if (seenInBatch.has(staffId)) {
    errors.push(`Staff ID "${staffId}" appears more than once in this file`)
  }
  if (!position) errors.push('Position is required')
  if (!VALID_CATEGORIES.includes(category)) {
    errors.push(`Category must be "Shift" or "Straight Day" (got "${category || 'empty'}")`)
  }

  return {
    _rowIndex: index + 1,
    full_name: fullName,
    staff_id: staffId,
    position,
    category,
    _errors: errors,
    _valid: errors.length === 0,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export const NewEmployeePage = () => {
  const navigate = useNavigate()
  const { profile: currentUser } = useAuth()
  const isCurrentUserAdmin = currentUser?.role === 'admin'
  const backPath = isCurrentUserAdmin ? '/users' : '/records'

  // Tab state
  const [activeTab, setActiveTab] = useState('single') // 'single' | 'bulk'

  // ── Single employee form state ──────────────────────────────────────────
  const [loadingDepts, setLoadingDepts] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [departments, setDepartments] = useState([])
  const [fullName, setFullName] = useState('')
  const [staffId, setStaffId] = useState('')
  const [category, setCategory] = useState('Shift')
  const [position, setPosition] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  // ── Bulk upload state ───────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false)
  const [parsedRows, setParsedRows] = useState(null) // null = no file yet
  const [bulkUploading, setBulkUploading] = useState(false)
  const fileInputRef = useRef(null)

  // ── Load departments ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchDepartments = async () => {
      setLoadingDepts(true)
      try {
        const { data, error } = await supabase.from('departments').select('*').order('name')
        if (error) throw error
        setDepartments(data || [])
        // Pre-select the Rep's own department
        const repDeptId = currentUser?.department_id
        if (repDeptId) {
          setDepartmentId(repDeptId)
        } else if (data && data.length > 0) {
          setDepartmentId(data[0].id)
        }
      } catch (err) {
        console.error('Error loading departments:', err.message)
        toast.error('Failed to load departments.')
      } finally {
        setLoadingDepts(false)
      }
    }
    fetchDepartments()
  }, [currentUser])

  // ── Single employee submit ──────────────────────────────────────────────
  const handleSingleSubmit = async (e) => {
    e.preventDefault()
    if (!fullName.trim() || !staffId.trim()) {
      toast.error('Please fill in all required fields.')
      return
    }
    if (!departmentId) {
      toast.error('Please select a department.')
      return
    }
    setSubmitting(true)
    try {
      const newUserId = `emp-${Math.random().toString(36).substr(2, 9)}`
      const dummyEmail = `emp-${newUserId}@cbi-overtime.local`
      const { error: profileError } = await supabase.from('profiles').insert({
        id: newUserId,
        email: dummyEmail,
        password: 'NoLogin123!',
        full_name: fullName.trim(),
        staff_id: staffId.trim(),
        category,
        position: position.trim(),
        role: 'employee',
        department_id: departmentId,
        is_active: true,
      })
      if (profileError) throw profileError
      toast.success(`${fullName} has been onboarded as an Employee!`, {
        icon: <CheckCircle2 className="text-[#006939]" />,
      })
      navigate(backPath)
    } catch (err) {
      console.error('Creation failed:', err.message)
      toast.error(err.message || 'Failed to create new employee.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Template download ───────────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    // Resolve the Rep's department name for the info sheet
    const repDept = departments.find((d) => d.id === currentUser?.department_id)
    const deptName = repDept?.name || currentUser?.departments?.name || 'Your Department'

    const wsData = [
      // Header row
      TEMPLATE_HEADERS,
      // Sample rows
      ...TEMPLATE_SAMPLE.map((r) => TEMPLATE_HEADERS.map((h) => r[h])),
    ]

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Style column widths
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 16 }]

    // Add a second info sheet
    const infoData = [
      ['CBI Bulk Employee Upload Template'],
      [''],
      ['Department', deptName],
      [''],
      ['INSTRUCTIONS'],
      ['1. Do NOT modify the header row (row 1).'],
      ['2. Fill one employee per row starting from row 2.'],
      ['3. Category must be exactly: Shift  OR  Straight Day'],
      ['4. Staff IDs must be unique across the entire system.'],
      ['5. Save as .xlsx or .csv, then upload in the app.'],
    ]
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData)
    wsInfo['!cols'] = [{ wch: 36 }, { wch: 28 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Employees')
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions')

    XLSX.writeFile(wb, 'CBI_Employee_Bulk_Upload_Template.xlsx')
    toast.success('Template downloaded!')
  }

  // ── File parsing ────────────────────────────────────────────────────────
  const processFile = useCallback(
    async (file) => {
      if (!file) return
      const name = file.name.toLowerCase()
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        toast.error('Please upload an .xlsx or .csv file.')
        return
      }

      try {
        // Load existing staff IDs to check duplicates
        const { data: existingProfiles } = await supabase
          .from('profiles')
          .select('staff_id')
        const existingStaffIds = new Set(
          (existingProfiles || []).map((p) => String(p.staff_id || '').trim())
        )

        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (!raw || raw.length === 0) {
          toast.error('The file appears to be empty.')
          return
        }

        // Normalise header keys (lowercase + trim)
        const normalised = raw.map((row) => {
          const out = {}
          for (const key of Object.keys(row)) {
            out[key.toLowerCase().trim()] = row[key]
          }
          return out
        })

        const seenInBatch = new Set()
        const validated = normalised.map((row, i) => {
          const result = validateRow(row, i, existingStaffIds, seenInBatch)
          if (result.staff_id) seenInBatch.add(result.staff_id)
          return result
        })

        setParsedRows(validated)
        const validCount = validated.filter((r) => r._valid).length
        const invalidCount = validated.length - validCount
        if (invalidCount > 0) {
          toast(`${validCount} valid, ${invalidCount} row(s) have issues. Review below.`, {
            icon: '⚠️',
          })
        } else {
          toast.success(`${validCount} employee(s) ready to import!`)
        }
      } catch (err) {
        console.error('Parse error:', err)
        toast.error('Failed to parse file. Please ensure it is a valid .xlsx or .csv.')
      }
    },
    [departments]
  )

  // ── Drag and drop handlers ──────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  // ── Bulk import ──────────────────────────────────────────────────────────
  const handleBulkImport = async () => {
    if (!parsedRows) return
    const validRows = parsedRows.filter((r) => r._valid)
    if (validRows.length === 0) {
      toast.error('No valid rows to import.')
      return
    }

    // Resolve department
    const repDeptId = currentUser?.department_id || departmentId
    if (!repDeptId) {
      toast.error('Cannot determine your department. Please contact an administrator.')
      return
    }

    setBulkUploading(true)
    try {
      const records = validRows.map((row) => ({
        id: `emp-${Math.random().toString(36).substr(2, 9)}`,
        email: `emp-${Math.random().toString(36).substr(2, 9)}@cbi-overtime.local`,
        password: 'NoLogin123!',
        full_name: row.full_name,
        staff_id: row.staff_id,
        position: row.position,
        category: row.category,
        role: 'employee',
        department_id: repDeptId,
        is_active: true,
      }))

      const { error } = await supabase.from('profiles').insert(records)
      if (error) throw error

      toast.success(`✅ ${validRows.length} employee(s) imported successfully!`)
      setParsedRows(null)
      navigate(backPath)
    } catch (err) {
      console.error('Bulk import failed:', err.message)
      toast.error(err.message || 'Bulk import failed. Please try again.')
    } finally {
      setBulkUploading(false)
    }
  }

  // ── Derived stats for bulk ───────────────────────────────────────────────
  const validCount = parsedRows ? parsedRows.filter((r) => r._valid).length : 0
  const invalidCount = parsedRows ? parsedRows.filter((r) => !r._valid).length : 0
  const repDeptName =
    departments.find((d) => d.id === currentUser?.department_id)?.name ||
    currentUser?.departments?.name ||
    'Your Department'

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-[#006939] hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight font-sans">
            Onboard Employees
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Add employees individually or upload multiple at once via spreadsheet.
          </p>
        </div>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-gray-100 p-1 gap-1">
        <button
          onClick={() => setActiveTab('single')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'single'
              ? 'bg-white text-[#006939] shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <User size={15} />
          Single Employee
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'bulk'
              ? 'bg-white text-[#006939] shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={15} />
          Bulk Upload
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
           TAB 1 — Single Employee Form
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'single' && (
        <form
          onSubmit={handleSingleSubmit}
          className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]" />
          <div className="p-6 sm:p-8 space-y-5">
            {/* Notice */}
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl text-xs space-y-1">
              <p className="font-bold uppercase tracking-wider">Employee Notice</p>
              <p className="text-blue-700 leading-relaxed">
                Employees added here are subjects for overtime tracking and cannot log into the
                system.
              </p>
            </div>

            {/* Full Name */}
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

            {/* Staff ID + Position + Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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

            {/* Department */}
            <div>
              <label className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FolderCheck size={14} />
                <span>Department</span>
              </label>
              {loadingDepts ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <select
                  required
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all cursor-pointer font-medium"
                  disabled={submitting}
                >
                  <option value="">-- Choose Department --</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Footer */}
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
      )}

      {/* ══════════════════════════════════════════════════════════════════
           TAB 2 — Bulk Upload
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'bulk' && (
        <div className="space-y-5">
          {/* Department badge + Step 1 card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]" />
            <div className="p-6 sm:p-8 space-y-5">
              {/* Department info */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <FolderCheck size={18} className="text-[#006939] shrink-0" />
                <div>
                  <p className="text-xs font-bold text-[#006939] uppercase tracking-wider">
                    Uploading for Department
                  </p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{repDeptName}</p>
                </div>
                <Info size={14} className="text-gray-400 ml-auto shrink-0" />
                <p className="text-xs text-gray-400 hidden sm:block">
                  All imported employees will be assigned to this department.
                </p>
              </div>

              {/* Step 1 — Download template */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#006939] text-white text-xs font-bold shrink-0">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-[#1A1A1A] uppercase tracking-wide">
                    Download the Template
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mb-3 ml-8">
                  Download the Excel template, fill in your employees, then come back and upload.
                  Required columns:{' '}
                  <span className="font-semibold text-gray-700">
                    full_name, staff_id, position, category
                  </span>
                  .
                </p>
                <div className="ml-8">
                  <button
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-[#006939] text-[#006939] rounded-lg text-sm font-bold hover:bg-[#006939] hover:text-white transition-all active:scale-[0.98] shadow-sm"
                  >
                    <Download size={15} />
                    Download Template (.xlsx)
                  </button>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Step 2 — Upload file */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#006939] text-white text-xs font-bold shrink-0">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-[#1A1A1A] uppercase tracking-wide">
                    Upload Your File
                  </h3>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`ml-8 cursor-pointer rounded-xl border-2 border-dashed transition-all p-8 flex flex-col items-center justify-center gap-3 text-center ${
                    isDragging
                      ? 'border-[#006939] bg-emerald-50 scale-[1.01]'
                      : 'border-gray-300 hover:border-[#006939] hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-3 rounded-full ${isDragging ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                    <FileSpreadsheet
                      size={26}
                      className={isDragging ? 'text-[#006939]' : 'text-gray-400'}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {isDragging ? 'Drop your file here' : 'Drag & drop your spreadsheet here'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      or{' '}
                      <span className="text-[#006939] font-semibold underline underline-offset-2">
                        click to browse
                      </span>
                      &nbsp;· Accepts .xlsx, .xls, .csv
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 3 — Preview Table ── */}
          {parsedRows && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/5 overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#006939] text-white text-xs font-bold shrink-0">
                    3
                  </span>
                  <h3 className="text-sm font-bold text-[#1A1A1A] uppercase tracking-wide">
                    Review & Import
                  </h3>
                </div>
                {/* Summary pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-full">
                    <CheckCircle size={12} />
                    {validCount} Valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-full">
                      <XCircle size={12} />
                      {invalidCount} Error(s)
                    </span>
                  )}
                  <button
                    onClick={() => setParsedRows(null)}
                    className="ml-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Clear file"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Warning if there are errors */}
              {invalidCount > 0 && (
                <div className="mx-5 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    <strong>{invalidCount} row(s)</strong> have validation errors and will be
                    skipped. Only the{' '}
                    <strong className="text-emerald-700">{validCount} valid row(s)</strong> will be
                    imported.
                  </span>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto mt-4 px-5 pb-5">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 rounded-lg">
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100 w-8">
                        #
                      </th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">
                        Status
                      </th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">
                        Full Name
                      </th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">
                        Staff ID
                      </th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">
                        Position
                      </th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">
                        Category
                      </th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wider border-b border-gray-100">
                        Issue(s)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr
                        key={row._rowIndex}
                        className={`border-b border-gray-50 transition-colors ${
                          row._valid ? 'hover:bg-emerald-50/40' : 'bg-red-50/50 hover:bg-red-50'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-gray-400 font-mono">{row._rowIndex}</td>
                        <td className="px-3 py-2.5">
                          {row._valid ? (
                            <CheckCircle size={14} className="text-emerald-500" />
                          ) : (
                            <XCircle size={14} className="text-red-500" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-800">
                          {row.full_name || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-700">
                          {row.staff_id || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">
                          {row.position || <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.category ? (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full font-semibold text-xs ${
                                VALID_CATEGORIES.includes(row.category)
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {row.category}
                            </span>
                          ) : (
                            <span className="text-gray-300 italic">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-red-600 text-xs leading-tight max-w-[220px]">
                          {row._errors.length > 0 ? (
                            <ul className="space-y-0.5">
                              {row._errors.map((e, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  <ChevronRight size={10} className="shrink-0 mt-0.5" />
                                  {e}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-emerald-500 font-medium">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import button footer */}
              <div className="bg-gray-50 px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3">
                <p className="text-xs text-gray-500">
                  {validCount > 0
                    ? `${validCount} employee(s) will be added to ${repDeptName}`
                    : 'Fix the errors in your file, then re-upload.'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                  >
                    <Upload size={14} />
                    Re-upload
                  </button>
                  <button
                    onClick={handleBulkImport}
                    disabled={bulkUploading || validCount === 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#006939] hover:bg-[#004D2A] text-white rounded-lg text-sm font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {bulkUploading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        Import {validCount} Employee{validCount !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NewEmployeePage
