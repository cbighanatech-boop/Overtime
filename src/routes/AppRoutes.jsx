import React from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

// Import Pages
import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import RecordsPage from '../pages/RecordsPage'
import NewRecordPage from '../pages/NewRecordPage'
import EditRecordPage from '../pages/EditRecordPage'
import RecordDetailPage from '../pages/RecordDetailPage'
import UsersPage from '../pages/UsersPage'
import NewUserPage from '../pages/NewUserPage'
import NewEmployeePage from '../pages/NewEmployeePage'
import DepartmentsPage from '../pages/DepartmentsPage'
import DepartmentDetailsPage from '../pages/DepartmentDetailsPage'
import AuditTrailPage from '../pages/AuditTrailPage' // New import

// Import PageWrapper
import PageWrapper from '../components/layout/PageWrapper'

// Core Layout Wrapper for all protected pages
const LayoutWrapper = () => {
  return (
    <PageWrapper>
      <Outlet />
    </PageWrapper>
  )
}


// Redirect if already authenticated
const PublicRoute = ({ children }) => {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-gray-light">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-green border-t-transparent"></div>
      </div>
    )
  }

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export const AppRoutes = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } 
      />

      {/* Protected Routes Wrapper */}
      <Route element={<ProtectedRoute><LayoutWrapper /></ProtectedRoute>}>
        {/* Dashboard - Accessible by all roles */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Overtime Records - Accessible by all roles */}
        <Route path="/records" element={<RecordsPage />} />
        
        {/* Record Details - Accessible by all roles */}
        <Route path="/records/:id" element={<RecordDetailPage />} />

        {/* Capture New Record - Rep & Admin only */}
        <Route 
          path="/records/new" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'rep']}>
              <NewRecordPage />
            </ProtectedRoute>
          } 
        />

        {/* Edit Overtime Record - Rep & Admin only */}
        <Route 
          path="/records/:id/edit" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'rep']}>
              <EditRecordPage />
            </ProtectedRoute>
          } 
        />

        {/* User Management List - Admin only */}
        <Route 
          path="/users" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <UsersPage />
            </ProtectedRoute>
          } 
        />

        {/* Create New User Form - Admin only */}
        <Route 
          path="/users/new" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <NewUserPage />
            </ProtectedRoute>
          } 
        />

        {/* Create New Employee Form - Admin & Rep */}
        <Route 
          path="/employees/new" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'rep']}>
              <NewEmployeePage />
            </ProtectedRoute>
          } 
        />

        {/* Department Management - Admin only */}
        <Route 
          path="/departments" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DepartmentsPage />
            </ProtectedRoute>
          } 
        />

        {/* Department Details - Admin only */}
        <Route 
          path="/departments/:id" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DepartmentDetailsPage />
            </ProtectedRoute>
          } 
        />

        {/* Audit Trail - Admin only */}
        <Route
          path="/audit"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AuditTrailPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Fallback Route */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes
