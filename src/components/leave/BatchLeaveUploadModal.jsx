import React, { useState, useRef } from 'react'
import { supabase } from '../../supabase/client'
import { 
  calculateAnnualLeaveEntitlement, 
  getTenureYears, 
  isEligibleForLeave,
  normalizeDateString 
} from '../../utils/leaveHelpers'
import * as XLSX from 'xlsx'
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  FileUp,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Search,
  Sparkles,
  Info,
  Calendar,
  UserCheck
} from 'lucide-react'
import toast from 'react-hot-toast'

export const BatchLeaveUploadModal = ({
  isOpen,
  onClose,
  selectedYear,
  employees = [],
  leaveTypes = [],
  onSuccess
}) => {
  const [batchFile, setBatchFile] = useState(null)
  const [parsedRows, setParsedRows] = useState(null)
  const [previewFilter, setPreviewFilter] = useState('all') // 'all' | 'valid' | 'issues'
  const [previewSearch, setPreviewSearch] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  if (!isOpen) return null

  // ── 1. Download Pre-populated Template ──────────────────────────────────────
  const handleDownloadTemplate = () => {
    try {
      const activeCbiEmployees = employees.filter(isEligibleForLeave)
      
      const headers = ['staff_id', 'full_name', 'date_of_engagement', 'native_status', 'entitled_days', 'used_days']
      
      const rows = activeCbiEmployees.map((emp) => {
        const entitled = calculateAnnualLeaveEntitlement(emp, selectedYear)
        return [
          emp.staff_id || '',
          emp.full_name || '',
          emp.date_of_engagement || '',
          emp.native_status || 'Native',
          entitled,
          0 // Default used days
        ]
      })

      const wsData = [headers, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [
        { wch: 16 }, // staff_id
        { wch: 28 }, // full_name
        { wch: 24 }, // date_of_engagement
        { wch: 16 }, // native_status
        { wch: 16 }, // entitled_days
        { wch: 14 }  // used_days
      ]

      const instructionsData = [
        ['CBI GHANA LTD - BATCH LEAVE DAYS UPLOAD INSTRUCTIONS'],
        [''],
        ['Target Year:', selectedYear],
        ['Total Pre-populated CBI Employees:', activeCbiEmployees.length],
        [''],
        ['COLUMN GUIDELINES:'],
        ['1. staff_id: Unique CBI Employee Staff ID (e.g. CBI-001). Required to match existing employee record.'],
        ['2. full_name: Full name of employee for verification.'],
        ['3. date_of_engagement (DOE): Format YYYY-MM-DD (e.g. 2021-04-15). Used to compute anniversary bonus days (+3 at 3-4 yrs, +4 at 5+ yrs).'],
        ['4. native_status: Must be "Native" (21 base days) or "Non-Native" (24 base days). Defaults to "Native" if blank.'],
        ['5. entitled_days: Enter custom annual leave entitlement days, or leave empty to auto-calculate from DOE and native status.'],
        ['6. used_days: Current leave days already taken/used by employee for Year ' + selectedYear + ' (defaults to 0 if empty).'],
        [''],
        ['EXCLUSIONS:'],
        ['Employees belonging to company "Abanach" are excluded from CBI Leave allocations.']
      ]
      const wsInfo = XLSX.utils.aoa_to_sheet(instructionsData)
      wsInfo['!cols'] = [{ wch: 34 }, { wch: 42 }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leave Balances')
      XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions')

      XLSX.writeFile(wb, `CBI_Employee_Leave_Days_Upload_${selectedYear}.xlsx`)
      toast.success(`Template downloaded with ${activeCbiEmployees.length} employees for Year ${selectedYear}!`)
    } catch (err) {
      console.error('Error generating template:', err)
      toast.error('Failed to generate upload template.')
    }
  }

  // ── 2. Parse and Validate Uploaded File ──────────────────────────────────────
  const processFile = async (file) => {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file.')
      return
    }

    setBatchFile(file)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const wsName = wb.SheetNames[0]
      const ws = wb.Sheets[wsName]
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rawRows || rawRows.length === 0) {
        toast.error('The uploaded file contains no data rows.')
        return
      }

      // Normalise row keys
      const validatedRows = rawRows.map((raw, idx) => {
        const row = {}
        Object.keys(raw).forEach((key) => {
          const cleanKey = key.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_')
          row[cleanKey] = raw[key]
        })

        // Identify fields with flexible matching
        const staffIdRaw = String(row.staff_id || row.staffid || row.employee_id || row.id || '').trim()
        const fullNameRaw = String(row.full_name || row.employee_name || row.name || row.employee || '').trim()
        const rawDoe = row.date_of_engagement || row.doe || row.engagement_date || row.start_date || ''
        const rawNative = String(row.native_status || row.native || row.origin || 'Native').trim()
        const rawEntitled = row.entitled_days ?? row.entitled ?? row.annual_leave_days ?? ''
        const rawUsed = row.used_days ?? row.used ?? row.days_used ?? row.taken ?? ''

        const errors = []
        const warnings = []

        // Match employee against employees list
        let matchedEmp = null
        if (staffIdRaw) {
          matchedEmp = employees.find(
            (e) =>
              (e.staff_id && e.staff_id.toString().trim().toLowerCase() === staffIdRaw.toLowerCase()) ||
              (e.full_name && e.full_name.trim().toLowerCase() === staffIdRaw.toLowerCase())
          )
        }
        if (!matchedEmp && fullNameRaw) {
          matchedEmp = employees.find(
            (e) => e.full_name && e.full_name.trim().toLowerCase() === fullNameRaw.toLowerCase()
          )
        }

        if (staffIdRaw && !/^CBI[/\\_ -]?[A-Z0-9]+/i.test(staffIdRaw)) {
          errors.push(`Staff ID "${staffIdRaw}" is invalid. Only IDs starting with CBI (e.g. CBI/XXX) are allowed.`)
        } else if (!matchedEmp) {
          errors.push(`Staff ID or Name "${staffIdRaw || fullNameRaw}" not found in CBI employees`)
        } else if (!isEligibleForLeave(matchedEmp)) {
          errors.push(`Employee "${matchedEmp.full_name}" is ineligible (ID must be e.g. CBI/XXX)`)
        } else if (matchedEmp.company?.toString().trim().toUpperCase() === 'ABANACH') {
          errors.push(`Employee "${matchedEmp.full_name}" belongs to Abanach (excluded)`)
        }

        // Parse DOE
        const normalizedDoe = normalizeDateString(rawDoe)
        if (rawDoe && !normalizedDoe) {
          warnings.push(`Unrecognized DOE format "${rawDoe}". Kept existing profile DOE.`)
        }

        const effectiveDoe = normalizedDoe || matchedEmp?.date_of_engagement || null

        // Parse Native Status
        let effectiveNative = 'Native'
        if (rawNative.toLowerCase().includes('non')) {
          effectiveNative = 'Non-Native'
        } else if (rawNative.toLowerCase().includes('nat')) {
          effectiveNative = 'Native'
        } else if (matchedEmp?.native_status) {
          effectiveNative = matchedEmp.native_status
        }

        // Calculate / Parse Entitled Days
        let effectiveEntitled = 21
        const dummyEmpForCalc = {
          date_of_engagement: effectiveDoe,
          native_status: effectiveNative
        }
        const statutoryEntitlement = calculateAnnualLeaveEntitlement(dummyEmpForCalc, selectedYear)
        const tenureYears = getTenureYears(dummyEmpForCalc, selectedYear)
        const baseDays = effectiveNative === 'Non-Native' ? 24 : 21
        const bonusDays = statutoryEntitlement - baseDays
        
        if (rawEntitled !== '' && !isNaN(Number(rawEntitled))) {
          const num = Number(rawEntitled)
          if (num < 0) {
            errors.push('Entitled days cannot be negative')
          } else {
            effectiveEntitled = num
          }
        } else {
          effectiveEntitled = statutoryEntitlement
        }

        // Parse Used Days
        let effectiveUsed = 0
        if (rawUsed !== '' && !isNaN(Number(rawUsed))) {
          const num = Number(rawUsed)
          if (num < 0) {
            errors.push('Used days cannot be negative')
          } else {
            effectiveUsed = num
          }
        }

        const remaining = Math.max(0, effectiveEntitled - effectiveUsed)

        return {
          rowIndex: idx + 2, // Excel 1-based, row 1 is header
          staff_id: staffIdRaw || matchedEmp?.staff_id || '',
          full_name: fullNameRaw || matchedEmp?.full_name || '',
          matchedEmployee: matchedEmp,
          date_of_engagement: effectiveDoe,
          native_status: effectiveNative,
          entitled_days: effectiveEntitled,
          used_days: effectiveUsed,
          remaining_days: remaining,
          statutoryEntitlement,
          baseDays,
          bonusDays,
          tenureYears,
          errors,
          warnings,
          isValid: errors.length === 0
        }
      })

      setParsedRows(validatedRows)
      const validCount = validatedRows.filter((r) => r.isValid).length
      toast.success(`Processed ${validatedRows.length} rows (${validCount} ready to upload).`)
    } catch (err) {
      console.error('File parsing error:', err)
      toast.error('Failed to parse file: ' + err.message)
    }
  }

  // ── 3. Execute Batch Database Update ─────────────────────────────────────────
  const handleExecuteUpload = async () => {
    if (!parsedRows || parsedRows.length === 0) {
      toast.error('No rows to upload.')
      return
    }

    const validRows = parsedRows.filter((r) => r.isValid && r.matchedEmployee)
    if (validRows.length === 0) {
      toast.error('No valid rows to upload. Please fix errors first.')
      return
    }

    const annualLt = leaveTypes.find((lt) => (lt.name || '').trim().toLowerCase() === 'annual leave')
    if (!annualLt) {
      toast.error('Annual Leave type not found in database.')
      return
    }

    setUploading(true)
    try {
      // 1. Update profiles table with date_of_engagement and native_status
      for (const row of validRows) {
        const updatePayload = {
          native_status: row.native_status
        }
        if (row.date_of_engagement) {
          updatePayload.date_of_engagement = row.date_of_engagement
        }
        const { error: profErr } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', row.matchedEmployee.id)

        if (profErr) {
          console.warn(`Profile update warning for ${row.matchedEmployee.full_name}:`, profErr.message)
        }
      }

      // 2. Upsert leave_balances for Annual Leave
      const balanceRecords = validRows.map((row) => ({
        employee_id: row.matchedEmployee.staff_id || row.matchedEmployee.full_name,
        employee_name: row.matchedEmployee.full_name,
        department_id: row.matchedEmployee.department_id,
        leave_type_id: annualLt.id,
        year: selectedYear,
        entitled_days: row.entitled_days,
        used_days: row.used_days
      }))

      const { error: upsertErr } = await supabase
        .from('leave_balances')
        .upsert(balanceRecords, { onConflict: 'employee_id,leave_type_id,year' })

      if (upsertErr) throw upsertErr

      toast.success(`Successfully batch updated leave days for ${validRows.length} employees!`)
      if (onSuccess) await onSuccess()
      handleClose()
    } catch (err) {
      console.error('Batch upload error:', err)
      toast.error('Batch upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setParsedRows(null)
    setBatchFile(null)
    setPreviewFilter('all')
    setPreviewSearch('')
    onClose()
  }

  // Filter preview rows
  const filteredRows = (parsedRows || []).filter((r) => {
    if (previewFilter === 'valid' && !r.isValid) return false
    if (previewFilter === 'issues' && r.isValid) return false
    if (previewSearch) {
      const q = previewSearch.toLowerCase()
      const matchName = (r.full_name || '').toLowerCase().includes(q)
      const matchId = (r.staff_id || '').toLowerCase().includes(q)
      if (!matchName && !matchId) return false
    }
    return true
  })

  const totalCount = parsedRows ? parsedRows.length : 0
  const validCount = parsedRows ? parsedRows.filter((r) => r.isValid).length : 0
  const errorCount = parsedRows ? parsedRows.filter((r) => !r.isValid).length : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden font-sans my-auto">
        
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-900 to-[#006939] text-white flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FDB913] text-[#1A1A1A]">
                Admin Tool
              </span>
              <span className="text-emerald-200 text-xs">•</span>
              <span className="text-emerald-100 text-xs font-semibold">
                Leave Management App
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <UploadCloud size={22} className="text-[#FDB913]" />
              Batch Upload Employee Leave Days (Year {selectedYear})
            </h2>
            <p className="text-emerald-100 text-xs max-w-2xl leading-relaxed">
              Batch update employee Date of Engagement (DOE), Native/Non-Native status, statutory anniversary bonus days, and current used leave days.
            </p>
          </div>

          <button
            onClick={handleClose}
            disabled={uploading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Step 1 & 2 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 1: Download Template */}
            <div className="p-5 bg-gradient-to-br from-emerald-50/60 to-white rounded-2xl border border-emerald-200 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#006939] uppercase tracking-wider">
                  <FileSpreadsheet size={16} />
                  <span>Step 1: Download Pre-filled Template</span>
                </div>
                <h3 className="font-extrabold text-sm text-gray-900">
                  Pre-populated with Current CBI Employees
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Generates an Excel spreadsheet containing all active CBI staff IDs, names, current DOE, origin status, and computed entitlement for Year {selectedYear}.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-sm transition-all active:scale-[0.98] w-full"
              >
                <Download size={15} />
                <span>Download Template (.xlsx)</span>
              </button>
            </div>

            {/* Card 2: Upload Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                if (e.dataTransfer.files?.[0]) {
                  processFile(e.dataTransfer.files[0])
                }
              }}
              className={`p-5 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-all ${
                isDragging
                  ? 'border-[#006939] bg-emerald-50/60 scale-[0.99]'
                  : 'border-gray-300 hover:border-gray-400 bg-gray-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    processFile(e.target.files[0])
                  }
                }}
              />

              <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 text-[#006939] flex items-center justify-center shadow-sm mb-2">
                <FileUp size={24} />
              </div>
              <h3 className="font-bold text-xs text-gray-900">
                {batchFile ? batchFile.name : 'Upload Completed Excel / CSV'}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Drag and drop your file here or click below to browse
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 px-4 py-1.5 rounded-xl bg-white border border-gray-300 hover:border-[#006939] hover:text-[#006939] font-bold text-xs text-gray-700 shadow-sm transition-colors"
              >
                Browse Files
              </button>
            </div>
          </div>

          {/* Step 3: Verification & Live Preview */}
          {parsedRows && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              
              {/* Summary Badges and Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPreviewFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      previewFilter === 'all'
                        ? 'bg-[#1A1A1A] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('valid')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      previewFilter === 'valid'
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <CheckCircle2 size={13} />
                    <span>Ready ({validCount})</span>
                  </button>
                  {errorCount > 0 && (
                    <button
                      onClick={() => setPreviewFilter('issues')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        previewFilter === 'issues'
                          ? 'bg-rose-700 text-white shadow-sm'
                          : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      <AlertCircle size={13} />
                      <span>Issues ({errorCount})</span>
                    </button>
                  )}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search preview rows..."
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006939]"
                  />
                </div>
              </div>

              {/* Preview Table */}
              <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-bold text-[10px] tracking-wider z-10">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Staff ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">DOE</th>
                      <th className="py-2.5 px-3">Origin</th>
                      <th className="py-2.5 px-3">Entitled (d)</th>
                      <th className="py-2.5 px-3">Used (d)</th>
                      <th className="py-2.5 px-3">Remaining (d)</th>
                      <th className="py-2.5 px-3">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-gray-400">
                          No matching records for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r, idx) => (
                        <tr
                          key={`${r.staff_id}-${idx}`}
                          className={`hover:bg-gray-50/70 transition-colors ${
                            !r.isValid ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-gray-400">{r.rowIndex}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-gray-800">{r.staff_id || 'N/A'}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900">{r.full_name}</td>
                          <td className="py-2.5 px-3 font-mono text-gray-600">
                            {r.date_of_engagement || <span className="text-gray-300 italic">None</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                r.native_status === 'Non-Native'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {r.native_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-gray-800">{r.entitled_days}</span>
                            {r.bonusDays > 0 && (
                              <span className="text-[10px] text-emerald-600 font-semibold block">
                                +{r.bonusDays} bonus
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-amber-700">{r.used_days}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-black text-[#006939] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100">
                              {r.remaining_days} d
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {r.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <Check size={11} /> Ready
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200"
                                title={r.errors.join('; ')}
                              >
                                <AlertCircle size={11} /> {r.errors[0]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <div>
            {parsedRows && (
              <span className="text-xs font-semibold text-gray-600">
                Ready to update: <strong className="text-emerald-700">{validCount}</strong> CBI employees for Year {selectedYear}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-xs transition-colors"
            >
              Cancel
            </button>

            {parsedRows && (
              <button
                type="button"
                onClick={handleExecuteUpload}
                disabled={uploading || validCount === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#006939] hover:bg-[#004D2A] text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Batch Updating ({validCount})...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>Confirm &amp; Batch Upload ({validCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default BatchLeaveUploadModal

