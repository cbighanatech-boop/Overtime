import React from 'react'
import { NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { 
  LayoutDashboard, 
  CalendarDays, 
  PlusCircle, 
  CalendarRange, 
  Clock, 
  Layers, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  Grid,
  FileCheck,
  CheckCircle2,
  Settings,
  ArrowLeftRight,
  Activity
} from 'lucide-react'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'
import { canApplyLeave } from '../../utils/leaveHelpers'

export const LeaveSidebar = ({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) => {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  // Navigation Items for the Leave App
  const navItems = [
    {
      name: 'Leave Dashboard',
      path: '/leave/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Leave Requests',
      path: '/leave/requests',
      icon: FileCheck,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Leave Planner',
      path: '/leave/planner',
      icon: CalendarDays,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Leave Calendar',
      path: '/leave/calendar',
      icon: CalendarRange,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Leave Balances',
      path: '/leave/balances',
      icon: Layers,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Leave Types & Days',
      path: '/leave/types',
      icon: Settings,
      roles: ['admin'] // Admin-only: full CRUD on types and days
    },
    {
      name: 'Audit Trail',
      path: '/leave/audit',
      icon: Activity,
      roles: ['admin'] // Admin-only: view all leave actions history
    }
  ]

  const userRole = profile?.role?.toLowerCase()
  const isAdminEmail = profile?.email?.includes('admin')
  const filteredNavItems = navItems.filter(item =>
    profile && (
      (userRole && item.roles.includes(userRole)) ||
      isAdminEmail
    )
  )

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#004D2A] text-white font-sans">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 bg-[#006939] border-b border-white/10">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex items-center justify-center p-1 rounded-lg bg-white/10 shrink-0">
            <img src="/logo.png" alt="CBI Logo" className="h-6 w-auto object-contain" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="truncate">
              <span className="font-bold text-base tracking-wide uppercase truncate font-sans text-white block leading-tight">
                CBI LEAVE
              </span>
              <span className="text-[10px] text-[#FDB913] font-bold tracking-widest uppercase">
                Time Off Portal
              </span>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button (Desktop Only) */}
        {!mobileOpen && (
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex items-center justify-center p-1.5 rounded-full hover:bg-white/10 text-white/80 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Switch App / Back to Launcher Hub Pill */}
      {(!collapsed || mobileOpen) && (
        <div className="p-3 bg-black/15 border-b border-white/10 flex flex-col gap-2">
          <Link
            to="/apps"
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all border border-white/15"
            title="Return to App Launcher"
          >
            <Grid size={14} className="text-[#FDB913]" />
            <span>App Hub / Switch App</span>
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[#006939]/70 hover:bg-[#006939] text-white/90 hover:text-white text-[11px] font-semibold transition-all border border-white/10"
            title="Open Overtime App"
          >
            <Clock size={12} className="text-[#FDB913]" />
            <span>Go to Overtime App</span>
          </Link>
        </div>
      )}

      {/* Profile summary */}
      {(!collapsed || mobileOpen) && profile && (
        <div className="px-4 py-3 border-b border-white/10 bg-black/10">
          <p className="text-[10px] uppercase text-white/50 tracking-widest font-bold">Logged In As</p>
          <p className="text-xs font-semibold truncate mt-0.5 text-white">{profile.full_name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[#FDB913]"></span>
            <span className="text-[11px] capitalize font-medium text-white/80">
              {profile.role} {profile.departments?.name ? `• ${profile.departments.name}` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => mobileOpen && setMobileOpen(false)}
              className={({ isActive }) => `
                flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                ${isActive 
                  ? 'bg-[#006939] text-white border-l-4 border-[#FDB913] pl-2 font-bold shadow-md shadow-black/10' 
                  : 'text-white/70 hover:bg-white/5 hover:text-white pl-3'
                }
              `}
              title={collapsed ? item.name : undefined}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Icon className="h-5 w-5 shrink-0" />
                {(!collapsed || mobileOpen) && <span className="font-medium truncate">{item.name}</span>}
              </div>
            </NavLink>
          )
        })}

        {/* Quick-Action Button: Apply for Leave (Reps & Admin) */}
        {canApplyLeave(profile) && (!collapsed || mobileOpen) && (
          <div className="pt-4 px-2">
            <button
              onClick={() => {
                if (mobileOpen) setMobileOpen(false)
                navigate('/leave/requests/new')
              }}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-[#FDB913] hover:bg-[#E0A200] text-[#004D2A] font-bold text-sm shadow-md transition-all active:scale-[0.98]"
            >
              <PlusCircle size={18} />
              <span>Apply for Leave</span>
            </button>
          </div>
        )}
      </nav>

      {/* Logout Footer */}
      <div className="p-2 border-t border-white/10 bg-black/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-200 hover:bg-red-950/20 hover:text-red-100 transition-colors pl-3"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {(!collapsed || mobileOpen) && <span>Logout</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div 
      className={`hidden md:block h-screen bg-[#004D2A] border-r border-white/10 shrink-0 transition-all duration-300 overflow-hidden
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {sidebarContent}
    </div>
  )
}

export default LeaveSidebar

