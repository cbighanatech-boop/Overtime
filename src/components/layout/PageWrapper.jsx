import React, { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileDrawer from './MobileDrawer'

export const PageWrapper = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6] font-sans antialiased text-[#1A1A1A]">
      {/* Mobile Drawer (Overlay sliding out on small devices) */}
      <MobileDrawer 
        mobileOpen={mobileOpen} 
        setMobileOpen={setMobileOpen} 
      />

      {/* Persistent / Collapsible Sidebar (Hidden on mobile, interactive on desktop) */}
      <Sidebar 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
        mobileOpen={mobileOpen} 
        setMobileOpen={setMobileOpen} 
      />

      {/* Main content pane */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header bar with status badges, names, and menu buttons */}
        <Header 
          setMobileOpen={setMobileOpen} 
        />

        {/* Dynamic, scrollable workspace pane */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F3F4F6]">
          {children}
        </main>
      </div>
    </div>
  )
}

export default PageWrapper
