import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldCheck, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const DEMO_ACCOUNTS = [
  { label: 'Admin',      email: 'admin@cbi-overtime.com',      role: 'admin',      color: '#006939', textColor: '#fff' },
  { label: 'Supervisor', email: 'supervisor@cbi-overtime.com', role: 'supervisor', color: '#DBEAFE', textColor: '#1E40AF' },
  { label: 'Rep',        email: 'rep@cbi-overtime.com',        role: 'rep',        color: '#FDB913', textColor: '#004D2A' },
]

export const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Determine redirect path (default to /dashboard)
  const from = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error("Please enter both email and password.")
      return
    }

    setSubmitting(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      console.error("Login attempt failed:", err.message)
      // AuthContext login() automatically raises a toast with the error message
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] relative overflow-hidden font-sans p-4">
      {/* Decorative Brand Gradient Backgrounds */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#006939]/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#FDB913]/5 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md z-10 transition-all duration-300">
        {/* Portal Header / Brand Identity */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="CBI Ghana Ltd Logo" className="h-16 w-auto object-contain drop-shadow-md animate-bounce-subtle" />
          </div>
          <h2 className="text-[36px] font-[900] text-[#1A1A1A] tracking-tight leading-tight uppercase font-sans">
            CBI OVERTIME
          </h2>
          <p className="text-[#4B5563] text-sm mt-1.5 font-medium tracking-wide">
            Time & Attendance Capture System
          </p>
        </div>

        {/* Login Form Panel */}
        <div className="bg-white rounded-2xl shadow-xl shadow-black/5 border border-gray-100 p-8 overflow-hidden relative">
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#006939]"></div>

          <h3 className="text-xl font-bold text-[#006939] mb-6 font-sans">
            Sign In
          </h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-xs font-bold text-[#006939] uppercase tracking-wider mb-2"
              >
                Email Address
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm placeholder-gray-400 text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all"
                  placeholder="name@cbi.com"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label 
                  htmlFor="password" 
                  className="block text-xs font-bold text-[#006939] uppercase tracking-wider"
                >
                  Password
                </label>
              </div>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-sm placeholder-gray-400 text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006939] focus:border-[#006939] transition-all"
                  placeholder="••••••••"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-[#006939] hover:bg-[#004D2A] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006939] transition-all disabled:opacity-50 active:scale-[0.99]"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Access Portal</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer info notes */}
        <div className="text-center mt-6 text-[#9CA3AF] text-xs">
          <p>© {new Date().getFullYear()} CBI Time & Attendance. All rights reserved.</p>
          <p className="mt-1">For authorized personnel only. Activities are audited.</p>
        </div>

        {/* Demo Credentials Panel */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-md p-5">
          <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest text-center mb-3">
            Demo Accounts — click to fill
          </p>
          <div className="flex gap-2">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.role}
                type="button"
                onClick={() => { setEmail(acct.email); setPassword('Password123') }}
                className="flex-1 py-2 px-1 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95 border"
                style={{ backgroundColor: acct.color, color: acct.textColor, borderColor: acct.color }}
              >
                {acct.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#9CA3AF] text-center mt-3">
            Password for all accounts: <span className="font-bold text-[#374151]">Password123</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
