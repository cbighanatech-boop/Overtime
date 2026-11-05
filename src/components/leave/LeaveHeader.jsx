import React, { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { 
  Menu, 
  LogOut, 
  ShieldAlert, 
  Award, 
  UserCheck, 
  Grid,
  CalendarCheck2,
  Clock,
  FileSpreadsheet,
  Loader2
} from 'lucide-react'
import { exportLeaveAppData } from '../../utils/dataExportHelper'

export const LeaveHeader = ({ setMobileOpen }) => {
  const { profile, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [extracting, setExtracting] = useState(false)

  const handleExtractAll = async () => {
    setExtracting(true)
    try {
      await exportLeaveAppData()
    } finally {
      setExtracting(false)
    }
  }

  // Derive page title from URL path
  const getPageTitle = () => {
    const path = location.pathname
    if (path === '/leave/dashboard') return 'Leave Dashboard'
    if (path === '/leave/requests') return 'Leave Requests & Approvals'
    if (path === '/leave/requests/new') return 'Apply for Leave'
    if (path.startsWith('/leave/requests/')) return 'Leave Request Details'
    if (path === '/leave/calendar') return 'Leave Calendar'
    if (path === '/leave/planner') return 'Team Annual Leave Planner'
    if (path === '/leave/balances') return 'Leave Balances & Entitlements'
    if (path === '/leave/types') return 'Leave Types & Days Configuration'
    if (path === '/leave/audit') return 'Leave Audit Trail'
    return 'CBI Leave Management'
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const getRoleBadgeStyles = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-white/20 text-white border border-white/40'
      case 'rep':
        return 'bg-[#FDB913] text-[#004D2A] font-bold'
      case 'supervisor':
        return 'bg-blue-100 text-blue-800 font-semibold'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <header className="h-16 px-4 md:px-6 flex items-center justify-between bg-[#006939] text-white shadow-md border-b border-white/10 shrink-0 font-sans z-20 relative">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-white/10 text-white md:hidden transition-colors"
          aria-label="Open sidebar menu"
        >
          <Menu size={20} />
        </button>

        {/* Title / Breadcrumbs */}
        <div className="flex items-center gap-2">
          <Link 
            to="/apps" 
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/90 transition-colors"
            title="Back to App Selector"
          >
            <Grid size={13} className="text-[#FDB913]" />
            <span>App Hub</span>
          </Link>
          <span className="hidden sm:inline-block text-white/40">/</span>
          <span className="hidden sm:inline-block text-xs uppercase tracking-widest text-[#FDB913] font-bold">
            Leave App
          </span>
          <span className="hidden sm:inline-block text-white/40">/</span>
          <h1 className="text-lg md:text-xl font-bold tracking-tight font-sans text-white truncate">
            {getPageTitle()}
          </h1>
        </div>
      </div>

      {/* User Information & Quick Switch */}
      {profile && (
        <div className="flex items-center gap-2 md:gap-3">
          {/* Extract All Leave Data button */}
          <button
            onClick={handleExtractAll}
            disabled={extracting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#004D2A] hover:bg-[#00381E] border border-white/20 text-white text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Extract all Leave App data points to Excel (.xlsx)"
          >
            {extracting ? (
              <Loader2 size={14} className="animate-spin text-[#FDB913]" />
            ) : (
              <FileSpreadsheet size={14} className="text-[#FDB913]" />
            )}
            <span className="hidden sm:inline">Extract All Data</span>
          </button>

          {/* Quick link to Overtime App */}
          <Link
            to="/dashboard"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/10"
            title="Switch directly to Overtime App"
          >
            <Clock size={13} className="text-[#FDB913]" />
            <span>Overtime App</span>
          </Link>

          <div className="flex flex-col text-right hidden sm:flex">
            <span className="text-sm font-semibold">{profile.full_name}</span>
            <span className="text-xs text-white/70">
              {profile.departments?.name || 'All Departments'}
            </span>
          </div>

          {/* Role badge */}
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center gap-1 ${getRoleBadgeStyles(profile.role)}`}>
            {profile.role === 'admin' && <ShieldAlert size={12} />}
            {profile.role === 'supervisor' && <Award size={12} />}
            {profile.role === 'rep' && <UserCheck size={12} />}
            {profile.role}
          </span>

          {/* Inline logout */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center p-2 rounded-lg hover:bg-white/10 text-red-200 hover:text-red-100 transition-colors"
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  )
}

export default LeaveHeader

