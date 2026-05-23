import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-screen flex items-center justify-center bg-brand-gray-light min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-brand-green border-t-transparent"></div>
          <p className="mt-4 text-brand-gray-mid font-medium font-sans">Verifying security credentials...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    // Redirect to login but save the path they tried to visit
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If roles are restricted and user doesn't have required permission
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // Fire the hot-toast on next micro-tick to avoid react lifecycle warning during render
    setTimeout(() => {
      toast.error("Unauthorized: You do not have access to this page.", { id: 'unauthorized-toast' })
    }, 0)
    
    return <Navigate to="/dashboard" replace />
  }

  return children
}
