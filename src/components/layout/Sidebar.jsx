import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { 
  LayoutDashboard, 
  FileText, 
  BarChart3, 
  Users, 
  FolderTree, 
  PlusCircle, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Activity
} from 'lucide-react'
import { isAdmin, isRep, isSupervisor } from '../../utils/roleHelpers'

export const Sidebar = ({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) => {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error("Logout failed:", err)
    }
  }

  // Define navigation links based on user roles
  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Records',
      path: '/records',
      icon: FileText,
      roles: ['admin', 'rep', 'supervisor']
    },
    {
      name: 'Users',
      path: '/users',
      icon: Users,
      roles: ['admin']
    },
    {
      name: 'Departments',
      path: '/departments',
      icon: FolderTree,
      roles: ['admin']
    },
    {
      name: 'Audit Trail',
      path: '/audit',
      icon: Activity,
      roles: ['admin']
    }
  ]

  // Filter navigation items by active user role
  const userRole = profile?.role?.toLowerCase();
  const isAdminEmail = profile?.email?.includes('admin');
  const filteredNavItems = navItems.filter(item =>
    profile && (
      (userRole && item.roles.includes(userRole)) ||
      isAdminEmail
    )
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#004D2A] text-white">
      {/* Logo / Brand Area */}
      <div className="flex items-center justify-between h-16 px-4 bg-[#006939] border-b border-white/10">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex items-center justify-center p-1 rounded-lg bg-white/10 shrink-0">
            <img src="/logo.png" alt="CBI Logo" className="h-6 w-auto object-contain" />
          </div>
          {(!collapsed || mobileOpen) && (
            <span className="font-bold text-lg tracking-wide uppercase truncate font-sans">
              CBI Portal
            </span>
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

      {/* Profile summary in Sidebar (Desktop Expanded & Mobile Only) */}
      {(!collapsed || mobileOpen) && profile && (
        <div className="px-4 py-4 border-b border-white/10 bg-black/10">
          <p className="text-xs uppercase text-white/50 tracking-widest font-bold">Logged In As</p>
          <p className="text-sm font-semibold truncate mt-1 text-white">{profile.full_name}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`inline-block w-2 h-2 rounded-full bg-[#FDB913] shimmer`}></span>
            <span className="text-xs capitalize font-medium text-white/80">
              {profile.role} {profile.departments?.name ? `• ${profile.departments.name}` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => mobileOpen && setMobileOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150
                ${isActive 
                  ? 'bg-[#006939] text-white border-l-4 border-[#FDB913] pl-2 font-bold shadow-md shadow-black/10' 
                  : 'text-white/70 hover:bg-white/5 hover:text-white pl-3'
                }
              `}
              title={collapsed ? item.name : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {(!collapsed || mobileOpen) && <span className="font-sans font-medium">{item.name}</span>}
            </NavLink>
          )
        })}

        {/* Quick-Action Buttons for Reps & Admins (Expanded & Mobile Only) */}
        {(isRep(profile) || isAdmin(profile)) && (!collapsed || mobileOpen) && (
          <div className="pt-4 px-2 space-y-2">
            <button
              onClick={() => {
                if (mobileOpen) setMobileOpen(false)
                navigate('/records/new')
              }}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-[#FDB913] hover:bg-[#E0A200] text-[#004D2A] font-bold text-sm shadow-md transition-all active:scale-[0.98] font-sans"
            >
              <PlusCircle size={18} />
              <span>New Entry</span>
            </button>
            {isAdmin(profile) && (
              <button
                onClick={() => {
                  if (mobileOpen) setMobileOpen(false)
                  navigate('/employees/new')
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20 transition-all active:scale-[0.98] font-sans"
              >
                <Users size={18} />
                <span>Add Employee</span>
              </button>
            )}
          </div>
        )}
      </nav>

      {/* Logout Footer */}
      <div className="p-2 border-t border-white/10 bg-black/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium text-red-200 hover:bg-red-950/20 hover:text-red-100 transition-colors pl-3"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {(!collapsed || mobileOpen) && <span className="font-sans">Logout</span>}
        </button>
      </div>
    </div>
  )

  // Render on Mobile (Overlay Drawer) or Desktop (Sticky Sidebar)
  return (
    <>
      {/* Desktop Sidebar */}
      <div 
        className={`hidden md:block h-screen bg-[#004D2A] border-r border-white/10 shrink-0 transition-all duration-300 overflow-hidden
          ${collapsed ? 'w-16' : 'w-64'}
        `}
      >
        {sidebarContent}
      </div>
    </>
  )
}

export default Sidebar
