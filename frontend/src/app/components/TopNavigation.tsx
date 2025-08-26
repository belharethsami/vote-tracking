'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function TopNavigation() {
  const pathname = usePathname()
  
  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-xl font-semibold text-gray-800">
        PDF Vote Tracking System
      </h1>
      
      <nav className="flex space-x-1">
        <Link 
          href="/" 
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname === '/' 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Vote Tracking System
        </Link>
        <Link 
          href="/pdf-analysis" 
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname === '/pdf-analysis' 
              ? 'bg-blue-100 text-blue-700' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          PDF Analysis
        </Link>
      </nav>
    </div>
  )
}