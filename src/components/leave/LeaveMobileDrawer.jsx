import React from 'react'
import LeaveSidebar from './LeaveSidebar'
import { X } from 'lucide-react'

export const LeaveMobileDrawer = ({ mobileOpen, setMobileOpen }) => {
  if (!mobileOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex md:hidden font-sans">
      {/* Backdrop overlay */}
      <div 
        onClick={() => setMobileOpen(false)}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      ></div>

      {/* Drawer content */}
      <div className="relative flex flex-col w-full max-w-xs h-full bg-[#004D2A] shadow-2xl transition-transform duration-300">
        <div className="absolute top-3 right-3 z-10">
          <button 
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center p-2 rounded-full bg-black/25 hover:bg-black/40 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="h-full">
          <LeaveSidebar 
            collapsed={false}
            setCollapsed={() => {}}
            mobileOpen={true}
            setMobileOpen={setMobileOpen}
          />
        </div>
      </div>
    </div>
  )
}

export default LeaveMobileDrawer

