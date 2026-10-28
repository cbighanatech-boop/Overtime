import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/client'
import { 
  Clock, 
  CalendarDays, 
  ArrowRight, 
  LogOut, 
  ShieldCheck, 
  CheckCircle2, 
  FileText, 
  Users, 
  TrendingUp, 
  Award, 
  UserCheck, 
  ShieldAlert,
  Sparkles,
  Building2,
  CalendarCheck
} from 'lucide-react'
import { isAdmin, isRep, isSupervisor } from '../utils/roleHelpers'

export const AppLauncherPage = () => {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    pendingOvertime: 0,
    pendingLeaves: 0,
    activeStaff: 0
  })

  useEffect(() => {
    const fetchQuickStats = async () => {
      if (!profile) return
      try {
        // Pending overtime query
        let otQuery = supabase
          .from('overtime_records')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Pending')
        if (!isAdmin(profile) && profile.department_id) {
          otQuery = otQuery.eq('department_id', profile.department_id)
        }
        const { count: otCount } = await otQuery

        // Pending leaves query
        let leaveQuery = supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Pending')
        if (!isAdmin(profile) && profile.department_id) {
          leaveQuery = leaveQuery.eq('department_id', profile.department_id)
        }
        const { count: leaveCount } = await leaveQuery

        setStats({
          pendingOvertime: otCount || 0,
          pendingLeaves: leaveCount || 0,
          activeStaff: 0
        })
      } catch (err) {
        console.warn('Stats fetch notice:', err.message)
      }
    }

    fetchQuickStats()
  }, [profile])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const getRoleBadge = () => {
    const role = profile?.role?.toLowerCase()
    switch (role) {
      case 'admin':
        return { label: 'Administrator', bg: 'bg-[#004D2A] text-white border border-[#006939]' }
      case 'supervisor':
        return { label: 'Supervisor', bg: 'bg-blue-800 text-white' }
      case 'rep':
        return { label: 'Department Rep', bg: 'bg-[#FDB913] text-[#004D2A] font-bold' }
      default:
        return { label: profile?.role || 'Staff', bg: 'bg-gray-700 text-white' }
    }
  }

  const roleBadge = getRoleBadge()

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col font-sans relative overflow-x-hidden selection:bg-[#006939] selection:text-white">
      {/* Decorative Brand Ambient Background */}
      <div className="absolute top-0 left-1/4 w-[700px] h-[400px] rounded-full bg-[#006939]/8 blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[400px] rounded-full bg-[#FDB913]/10 blur-[130px] pointer-events-none"></div>

      {/* Top Navigation Bar */}
      <header className="bg-[#006939] text-white shadow-md border-b border-white/10 px-4 sm:px-8 py-3.5 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-white/10 shrink-0">
              <img src="/logo.png" alt="CBI Ghana Ltd" className="h-8 w-auto object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg tracking-wider uppercase font-sans">
                  CBI PORTAL
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest bg-white/15 px-2 py-0.5 rounded-full text-white/90 hidden sm:inline-block">
                  Enterprise Hub
                </span>
              </div>
              <p className="text-xs text-white/70 hidden sm:block">
                CBI Ghana Limited • Internal Work Management
              </p>
            </div>
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-white leading-tight">{profile?.full_name}</p>
              <div className="flex items-center justify-end gap-1.5 text-xs text-white/80">
                <Building2 size={12} className="text-[#FDB913]" />
                <span>{profile?.departments?.name || 'All Departments'}</span>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleBadge.bg}`}>
              {roleBadge.label}
            </span>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-red-200 hover:text-white transition-all text-xs font-bold border border-white/10"
              title="Sign Out"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-8 py-8 sm:py-12 z-10 flex flex-col justify-center">
        {/* Welcome Section */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#006939]/10 text-[#006939] text-xs font-bold mb-4">
            <Sparkles size={14} className="text-[#FDB913]" />
            <span>Welcome back, {profile?.full_name?.split(' ')[0]}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#1A1A1A] tracking-tight uppercase font-sans">
            SELECT APPLICATION
          </h1>
          <p className="text-gray-600 text-sm sm:text-base mt-2.5 max-w-lg mx-auto">
            Choose a business portal to proceed with your workflow. Your permissions and department access are shared across both systems.
          </p>
        </div>

        {/* Application Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto w-full">
          
          {/* 1. OVERTIME APP CARD */}
          <div 
            onClick={() => navigate('/dashboard')}
            className="group relative bg-white rounded-3xl p-7 sm:p-9 border border-gray-200/90 shadow-xl shadow-gray-200/50 hover:shadow-2xl hover:border-[#006939] transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden hover:-translate-y-1"
          >
            {/* Top Accent Strip */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#006939] via-[#004D2A] to-[#006939] group-hover:h-3 transition-all"></div>

            <div>
              {/* Header inside Card */}
              <div className="flex items-start justify-between mb-6">
                <div className="p-4 rounded-2xl bg-[#006939] text-white shadow-lg shadow-[#006939]/20 group-hover:scale-110 transition-transform duration-300">
                  <Clock size={32} />
                </div>
                {stats.pendingOvertime > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[#FDB913] text-[#004D2A] shadow-sm animate-pulse">
                    {stats.pendingOvertime} Pending Review
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <div className="mb-6">
                <span className="text-xs font-bold tracking-widest uppercase text-[#006939]">
                  TIME & ATTENDANCE
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-[#1A1A1A] mt-1 group-hover:text-[#006939] transition-colors">
                  Overtime App
                </h3>
                <p className="text-gray-600 text-sm mt-3 leading-relaxed">
                  Log, verify, and approve overtime hours for factory and office employees. Includes automated rate multipliers, supervisor reviews, and exportable financial summaries.
                </p>
              </div>

              {/* Feature Tags */}
              <div className="flex flex-wrap gap-2 mb-8">
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Shift & Day Roster
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Rate Multipliers
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Supervisor Approvals
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Payroll Reports
                </span>
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 group-hover:text-[#006939] transition-colors">
                Time & Attendance Portal
              </span>
              <button 
                type="button"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] group-hover:bg-[#004D2A] text-white font-bold text-sm shadow-md shadow-[#006939]/20 transition-all group-hover:gap-3"
              >
                <span>Open Overtime</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* 2. LEAVE APP CARD */}
          <div 
            onClick={() => navigate('/leave/dashboard')}
            className="group relative bg-white rounded-3xl p-7 sm:p-9 border border-gray-200/90 shadow-xl shadow-gray-200/50 hover:shadow-2xl hover:border-[#006939] transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden hover:-translate-y-1"
          >
            {/* Top Accent Strip */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#FDB913] via-[#006939] to-[#FDB913] group-hover:h-3 transition-all"></div>

            <div>
              {/* Header inside Card */}
              <div className="flex items-start justify-between mb-6">
                <div className="p-4 rounded-2xl bg-[#004D2A] text-[#FDB913] shadow-lg shadow-black/10 group-hover:scale-110 transition-transform duration-300">
                  <CalendarDays size={32} />
                </div>
                {stats.pendingLeaves > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500 text-white shadow-sm animate-pulse">
                    {stats.pendingLeaves} Pending Review
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <div className="mb-6">
                <span className="text-xs font-bold tracking-widest uppercase text-[#006939]">
                  TIME OFF & ABSENCE
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-[#1A1A1A] mt-1 group-hover:text-[#006939] transition-colors">
                  Leave App
                </h3>
                <p className="text-gray-600 text-sm mt-3 leading-relaxed">
                  Submit leave applications on behalf of staff, approve or decline requests with supervisor notes, monitor annual entitlements and leave balances, and track team availability.
                </p>
              </div>

              {/* Feature Tags */}
              <div className="flex flex-wrap gap-2 mb-8">
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Rep Requests
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Supervisor Approvals
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Annual Entitlements
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  Team Calendar
                </span>
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 group-hover:text-[#006939] transition-colors">
                Leave & Absence Portal
              </span>
              <button 
                type="button"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006939] group-hover:bg-[#004D2A] text-white font-bold text-sm shadow-md shadow-[#006939]/20 transition-all group-hover:gap-3"
              >
                <span>Open Leave App</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

        </div>

        {/* Roles information banner */}
        <div className="mt-10 sm:mt-12 max-w-4xl mx-auto w-full bg-white/80 backdrop-blur rounded-2xl p-5 border border-gray-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-[#006939] rounded-xl shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">
                Single Sign-On Activated
              </p>
              <p className="text-xs text-gray-500">
                You are signed in as <strong className="text-gray-700">{profile?.email}</strong>. Seamlessly switch between Overtime and Leave apps anytime from the sidebar.
              </p>
            </div>
          </div>
          <div className="text-xs text-gray-400 font-medium">
            CBI Ghana Ltd © {new Date().getFullYear()}
          </div>
        </div>
      </main>
    </div>
  )
}

export default AppLauncherPage

