import React, { createContext, useContext, useState, useEffect } from 'react'
import toast from 'react-hot-toast'

// ============================================================
// MOCK USER ACCOUNTS — No Supabase required
// ============================================================
const MOCK_USERS = [
  {
    id: 'user-admin-001',
    email: 'admin@cbi-overtime.com',
    password: 'Password123',
    full_name: 'Richmond Appiah',
    role: 'admin',
    department_id: 'dept-001',
    departments: { name: 'Engineering' },
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-super-002',
    email: 'supervisor@cbi-overtime.com',
    password: 'Password123',
    full_name: 'David Mills',
    role: 'supervisor',
    department_id: 'dept-002',
    departments: { name: 'Production' },
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-rep-003',
    email: 'rep@cbi-overtime.com',
    password: 'Password123',
    full_name: 'Kofi Mensah',
    role: 'rep',
    department_id: 'dept-003',
    departments: { name: 'Operations' },
    is_active: true,
    created_at: new Date().toISOString(),
  },
]

const SESSION_KEY = 'cbi_mock_session'

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
})

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setSession(parsed.session)
        setUser(parsed.user)
        setProfile(parsed.profile)
      }
    } catch (_) {
      localStorage.removeItem(SESSION_KEY)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshProfile = async () => {
    // No-op in mock mode — profile is already in state
  }

  // Login handler — matches dynamically against the offline database profiles
  const login = async (email, password) => {
    setLoading(true)

    // Simulate a brief network delay for realism
    await new Promise((r) => setTimeout(r, 600))

    // Pull from live local storage profiles
    const profilesData = localStorage.getItem('cbi_mock_db_profiles')
    const activeProfiles = profilesData ? JSON.parse(profilesData) : MOCK_USERS

    const match = activeProfiles.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && (u.password === password || (!u.password && password === 'Password123'))
    )

    if (!match) {
      setLoading(false)
      toast.error('Invalid email or password.')
      throw new Error('Invalid credentials')
    }

    if (!match.is_active) {
      setLoading(false)
      toast.error('Your account has been deactivated. Please contact an Administrator.')
      throw new Error('Account deactivated')
    }

    // Build a minimal session-like object
    const mockSession = { access_token: `mock-token-${match.id}`, user: { id: match.id } }
    const { password: _pw, ...safeProfile } = match

    // If department name isn't hydrated, hydrate it
    if (!safeProfile.departments) {
      const deptsData = localStorage.getItem('cbi_mock_db_departments')
      const depts = deptsData ? JSON.parse(deptsData) : []
      const d = depts.find(dept => dept.id === safeProfile.department_id)
      safeProfile.departments = d ? { name: d.name } : { name: 'Operations' }
    }

    setSession(mockSession)
    setUser({ id: match.id, email: match.email })
    setProfile(safeProfile)

    // Persist to localStorage
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ session: mockSession, user: { id: match.id, email: match.email }, profile: safeProfile })
    )

    toast.success(`Welcome back, ${match.full_name}!`)
    setLoading(false)
    return { session: mockSession, user: { id: match.id } }
  }

  // Logout handler
  const logout = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 300))
    setSession(null)
    setUser(null)
    setProfile(null)
    localStorage.removeItem(SESSION_KEY)
    setLoading(false)
    toast.success('Successfully logged out.')
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
