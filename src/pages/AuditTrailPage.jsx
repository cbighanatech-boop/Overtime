import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import { RefreshCw, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

const AuditTrailPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('performed_at', { ascending: false });
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err.message);
      toast.error('Could not load audit trail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6 font-sans p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileText size={24} className="text-[#006939]" /> Audit Trail
        </h2>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1 px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm"
          title="Refresh"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse text-gray-500">Loading audit logs…</div>
      ) : logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Performed By</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">When</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-800">{log.action}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{log.performed_by}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{new Date(log.performed_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 break-all max-w-xs">{JSON.stringify(log.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-500">No audit records found.</div>
      )}
    </div>
  );
};

export default AuditTrailPage;
