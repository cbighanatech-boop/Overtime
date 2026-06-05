import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { RefreshCw, FileText, Download, Activity, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'

const AuditTrailPage = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('performed_at', { ascending: false })
      if (error) throw error
      setLogs(data || [])
    } catch (err) {
      console.error('Failed to load audit logs:', err.message)
      toast.error('Could not load audit trail. Have you run the SQL migration?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const handleExport = () => {
    if (logs.length === 0) {
      toast.error("No data to export")
      return
    }

    const exportData = logs.map(log => ({
      'Log ID': log.id,
      'Action': log.action,
      'Performed By': log.performed_by,
      'Timestamp': format(new Date(log.performed_at), 'yyyy-MM-dd HH:mm:ss'),
      'Details': JSON.stringify(log.details)
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Logs")
    
    // Auto-size columns slightly
    const wscols = [
      {wch: 36}, // id
      {wch: 40}, // action
      {wch: 25}, // performed by
      {wch: 22}, // timestamp
      {wch: 60}  // details
    ]
    worksheet['!cols'] = wscols
    
    XLSX.writeFile(workbook, `CBI_Audit_Trail_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`)
    toast.success("Audit Trail Exported to Excel!")
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-[900] text-[#1A1A1A] uppercase tracking-tight flex items-center gap-2">
            <Activity size={24} className="text-[#006939]" /> 
            System Audit Trail
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Immutable log of all major activities within the system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold transition-all shadow-sm"
          >
            <RefreshCw size={16} /> <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#006939] hover:bg-[#004D2A] text-white text-sm font-bold transition-all shadow-md active:scale-[0.98]"
          >
            <Download size={16} /> <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(idx => (
                <div key={idx} className="flex gap-4 h-12 items-center border-b border-gray-100">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          </div>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[#006939]/5 text-[#006939] border-b border-[#006939]/10 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Action Event</th>
                  <th className="px-6 py-4">Performed By</th>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Additional Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-800 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#006939]"></div>
                      {log.action}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700">
                      {log.performed_by}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-medium whitespace-nowrap flex items-center gap-1.5">
                      <Calendar size={12} />
                      {format(new Date(log.performed_at), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-mono break-all max-w-sm truncate" title={JSON.stringify(log.details)}>
                      {JSON.stringify(log.details) === '{}' ? '-' : JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-gray-400 gap-3">
            <FileText size={48} className="text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-semibold">No audit records found.</p>
              <p className="text-xs text-gray-400 mt-1">Actions performed in the system will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AuditTrailPage
