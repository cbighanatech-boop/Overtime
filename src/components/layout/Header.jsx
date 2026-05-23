import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Menu, LogOut, ShieldAlert, Award, UserCheck } from 'lucide-react'

export const Header = ({ setMobileOpen }) => {
  const { profile, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Derive page title from URL path
  const getPageTitle = () => {
    const path = location.pathname
    if (path.startsWith('/dashboard')) return 'Dashboard Metrics'
    if (path === '/records') return 'Overtime Registry'
    if (path === '/records/new') return 'Capture Overtime'
    if (path.startsWith('/records/') && path.endsWith('/edit')) return 'Edit Overtime Record'
    if (path.startsWith('/records/')) return 'Record Details'
    if (path === '/reports') return 'Analytics & Exports'
    if (path === '/users') return 'User Directory'
    if (path === '/users/new') return 'Onboard New Employee'
    if (path === '/departments') return 'Department Hub'
    return 'CBI Management'
  };

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

  return (
    <header className="h-16 px-4 md:px-6 flex items-center justify-between bg-[#006939] text-white shadow-md border-b border-white/10 shrink-0 font-sans z-10">
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

      {/* User Information Pane */}
      {profile && (
        <div className="flex items-center gap-3 md:gap-6">
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
