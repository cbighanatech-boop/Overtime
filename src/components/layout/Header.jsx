import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useActionNotifications } from '../../context/ActionNotificationContext'
import { isAdmin } from '../../utils/roleHelpers'
import { 
  Menu, 
  LogOut, 
  ShieldAlert, 
  Award, 
  UserCheck, 
  Bell, 
  AlertTriangle, 
  Clock, 
  ChevronRight,
  ClipboardList
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

export const Header = ({ setMobileOpen }) => {
  const { profile, logout } = useAuth()
  const { summary } = useActionNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Derive page title from URL path
  const getPageTitle = () => {
    const path = location.pathname
    if (path.startsWith('/dashboard')) return 'Dashboard Metrics'
    if (path === '/records') return 'Overtime Registry'
    if (path === '/records/new') return 'Capture Overtime'
    if (path.startsWith('/records/') && path.endsWith('/edit')) return 'Edit Overtime Record'
    if (path.startsWith('/records/')) return 'Record Details'
    if (path === '/users') return 'User Directory'
    if (path === '/users/new') return 'Onboard New Employee'
    if (path === '/departments') return 'Department Hub'
    if (path === '/audit') return 'System Audit Trail'
    if (path === '/holidays') return 'Holiday Calendar'
    if (path === '/extra-hours') return 'Extra Hours Registry'
    if (path.startsWith('/admin-actions')) return 'Admin Action Center'
    return 'CBI Management'
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error("Logout failed:", err)
    }
  }

  // Get corresponding CSS for user role badges
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

  const dueItems = [...(summary?.overdue || []), ...(summary?.dueToday || [])]
  const totalAlerts = summary?.totalDueAlerts || 0

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
          <span className="hidden sm:inline-block text-xs uppercase tracking-widest text-white/60">
            CBI Portal
          </span>
          <span className="hidden sm:inline-block text-white/40">/</span>
          <h1 className="text-lg md:text-xl font-bold tracking-tight font-sans text-white">
            {getPageTitle()}
          </h1>
        </div>
      </div>

      {/* User Information & Notification Bell */}
      {profile && (
        <div className="flex items-center gap-2 md:gap-4">
          {/* Notification Bell (Admin Only) */}
          {isAdmin(profile) && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`relative p-2 rounded-xl transition-all ${
                  dropdownOpen 
                    ? 'bg-white/20 text-white shadow-inner' 
                    : 'hover:bg-white/10 text-white/90'
                }`}
                title="Action Items Due Notifications"
              >
                <Bell size={20} />
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-rose-500 text-white font-extrabold text-[10px] rounded-full flex items-center justify-center border-2 border-[#006939] shadow-sm animate-pulse">
                    {totalAlerts > 99 ? '99+' : totalAlerts}
                  </span>
                )}
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-gray-800 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fade-in font-sans">
                  {/* Dropdown Header */}
                  <div className="p-3.5 bg-gradient-to-r from-[#004D2A] to-[#006939] text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-[#FDB913]" />
                      <span className="font-bold text-sm">Action Reminders</span>
                    </div>
                    {totalAlerts > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                        {totalAlerts} Due
                      </span>
                    )}
                  </div>

                  {/* Dropdown Body */}
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                    {dueItems.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-500">
                        <ClipboardList className="mx-auto text-[#006939] mb-2 opacity-50" size={28} />
                        <p className="font-bold text-gray-700">All Caught Up!</p>
                        <p className="mt-0.5 text-gray-400">No action items due today or overdue.</p>
                      </div>
                    ) : (
                      dueItems.map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setDropdownOpen(false)
                            navigate('/admin-actions')
                          }}
                          className="p-3 hover:bg-gray-50 cursor-pointer transition-colors text-xs flex items-start gap-2.5"
                        >
                          <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                            item._dueInfo?.status === 'overdue' 
                              ? 'bg-rose-100 text-rose-700' 
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            <AlertTriangle size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-bold text-gray-800 truncate">{item.title}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                item._dueInfo?.status === 'overdue'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}>
                                {item._dueInfo?.label}
                              </span>
                            </div>
                            <p className="text-gray-500 truncate mt-0.5 text-[11px]">{item.task_description}</p>
                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                              <span>To: <strong className="text-gray-600">{item.assigned_name}</strong></span>
                              <span>Due: {item.due_date ? format(parseISO(item.due_date), 'MMM dd') : ''}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="p-2.5 bg-gray-50 border-t border-gray-100 text-center">
                    <button
                      onClick={() => {
                        setDropdownOpen(false)
                        navigate('/admin-actions')
                      }}
                      className="text-xs font-bold text-[#006939] hover:underline flex items-center justify-center gap-1 w-full py-1"
                    >
                      <span>Open Action Center</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col text-right hidden sm:flex">
            <span className="text-sm font-semibold">{profile.full_name}</span>
            <span className="text-xs text-white/70">
              {profile.departments?.name || 'No Department'}
            </span>
          </div>

          {/* Role badge */}
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center gap-1 ${getRoleBadgeStyles(profile.role)}`}>
            {profile.role === 'admin' && <ShieldAlert size={12} />}
            {profile.role === 'supervisor' && <Award size={12} />}
            {profile.role === 'rep' && <UserCheck size={12} />}
            {profile.role}
          </span>

          {/* Inline logout helper */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center p-2 rounded-lg hover:bg-white/10 text-red-200 hover:text-red-100 transition-colors"
            title="Log Out of System"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  )
}

export default Header
