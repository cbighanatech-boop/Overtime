import React, { useState } from 'react'
import LeaveSidebar from './LeaveSidebar'
import LeaveHeader from './LeaveHeader'
import LeaveMobileDrawer from './LeaveMobileDrawer'
import ErrorBoundary from '../ErrorBoundary'

export const LeavePageWrapper = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6] font-sans antialiased text-[#1A1A1A]">
      {/* Mobile Drawer */}
      <LeaveMobileDrawer 
        mobileOpen={mobileOpen} 
        setMobileOpen={setMobileOpen} 
      />

      {/* Persistent / Collapsible Sidebar */}
      <LeaveSidebar 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
        mobileOpen={mobileOpen} 
        setMobileOpen={setMobileOpen} 
      />

      {/* Main content pane */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <LeaveHeader 
          setMobileOpen={setMobileOpen} 
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F3F4F6]">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default LeavePageWrapper

