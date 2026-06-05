import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import toast from 'react-hot-toast'
import { logActivity } from '../utils/auditLogger'

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

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          departments (
            name
          )
        `)
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
      return data
    } catch (err) {
      console.error("Error fetching profile:", err.message)
      setProfile(null)
      return null
    }
  }

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession?.user) {
        fetchProfile(currentSession.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession)
        setUser(currentSession?.user ?? null)
        if (currentSession?.user) {
          fetchProfile(currentSession.user.id)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email, password) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      const userProfile = await fetchProfile(data.user.id)
      
      if (userProfile && !userProfile.is_active) {
        // Sign out if deactivated
        await supabase.auth.signOut()
        throw new Error('Your account has been deactivated. Please contact an Administrator.')
      }

      await logActivity('Logged In')

      toast.success(`Welcome back!`)
      return { session: data.session, user: data.user }
    } catch (err) {
      console.error('Login error:', err.message)
      toast.error(err.message || 'Invalid email or password.')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await logActivity('Logged Out')
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('Successfully logged out.')
    } catch (err) {
      console.error('Logout error:', err.message)
      toast.error('Failed to log out.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
