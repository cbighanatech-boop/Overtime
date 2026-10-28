import React from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

// Import App Launcher
import AppLauncherPage from '../pages/AppLauncherPage'

// Import Overtime App Pages
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
import AuditTrailPage from '../pages/AuditTrailPage'
import HolidaysPage from '../pages/HolidaysPage'
import ExtraHoursPage from '../pages/ExtraHoursPage'
import AdminActionsPage from '../pages/AdminActionsPage'

// Import Leave App Pages
import LeaveDashboardPage from '../pages/leave/LeaveDashboardPage'
import LeaveRequestsPage from '../pages/leave/LeaveRequestsPage'
import NewLeaveRequestPage from '../pages/leave/NewLeaveRequestPage'
import LeaveRequestDetailPage from '../pages/leave/LeaveRequestDetailPage'
import LeaveBalancesPage from '../pages/leave/LeaveBalancesPage'
import EmployeeLeaveBalancesPage from '../pages/leave/EmployeeLeaveBalancesPage'
import LeaveCalendarPage from '../pages/leave/LeaveCalendarPage'
import TeamLeavePlannerPage from '../pages/leave/TeamLeavePlannerPage'
import LeaveTypesPage from '../pages/leave/LeaveTypesPage'

// Import Layout Wrappers
import PageWrapper from '../components/layout/PageWrapper'
import LeavePageWrapper from '../components/leave/LeavePageWrapper'

// Overtime App Layout Wrapper
const OvertimeLayoutWrapper = () => {
  return (
    <PageWrapper>
      <Outlet />
    </PageWrapper>
  )
}

// Leave App Layout Wrapper
const LeaveLayoutWrapper = () => {
  return (
    <LeavePageWrapper>
      <Outlet />
    </LeavePageWrapper>
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
    return <Navigate to="/apps" replace />
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

      {/* App Launcher / Selector (Landing hub after login) */}
      <Route
        path="/apps"
        element={
          <ProtectedRoute>
            <AppLauncherPage />
          </ProtectedRoute>
        }
      />

      {/* =========================================
          MODULE 1: CBI OVERTIME APP
          ========================================= */}
      <Route element={<ProtectedRoute><OvertimeLayoutWrapper /></ProtectedRoute>}>
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

        {/* Create New Employee Form - Admin only */}
        <Route 
          path="/employees/new" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
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

        {/* Holiday Management - Admin only */}
        <Route
          path="/holidays"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <HolidaysPage />
            </ProtectedRoute>
          }
        />

        {/* Extra Hours - Admin only */}
        <Route
          path="/extra-hours"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ExtraHoursPage />
            </ProtectedRoute>
          }
        />

        {/* Action Items & Reminders - Admin only */}
        <Route
          path="/admin-actions"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminActionsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* =========================================
          MODULE 2: CBI LEAVE APP
          ========================================= */}
      <Route element={<ProtectedRoute><LeaveLayoutWrapper /></ProtectedRoute>}>
        {/* Leave Dashboard */}
        <Route path="/leave/dashboard" element={<LeaveDashboardPage />} />

        {/* All Leave Requests */}
        <Route path="/leave/requests" element={<LeaveRequestsPage />} />

        {/* Apply for Leave - Rep & Admin only */}
        <Route 
          path="/leave/requests/new" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'rep']}>
              <NewLeaveRequestPage />
            </ProtectedRoute>
          } 
        />

        {/* Single Request Details & Approvals */}
        <Route path="/leave/requests/:id" element={<LeaveRequestDetailPage />} />

        {/* Leave Balances & Entitlements */}
        <Route path="/leave/balances" element={<LeaveBalancesPage />} />
        <Route path="/leave/balances/:employeeId" element={<EmployeeLeaveBalancesPage />} />

        {/* Leave Calendar & Roster */}
        <Route path="/leave/calendar" element={<LeaveCalendarPage />} />

        {/* Team Annual Leave Planner - Visible to Rep & Supervisor (and Admin) */}
        <Route 
          path="/leave/planner" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'rep', 'supervisor']}>
              <TeamLeavePlannerPage />
            </ProtectedRoute>
          } 
        />

        {/* Leave Types & Days CRUD - Admin only */}
        <Route 
          path="/leave/types" 
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <LeaveTypesPage />
            </ProtectedRoute>
          } 
        />
      </Route>

      {/* Fallback Route -> Redirects to App Hub */}
      <Route path="*" element={<Navigate to="/apps" replace />} />
    </Routes>
  )
}

export default AppRoutes
