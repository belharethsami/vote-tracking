'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useApp } from './AppContext'
import { useEffect } from 'react'

export function TopNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const { state, setCurrentStep } = useApp()

  // Update current step based on the current pathname
  useEffect(() => {
    if (pathname === '/step1') {
      setCurrentStep(1)
    } else if (pathname === '/step2') {
      setCurrentStep(2)
    } else if (pathname === '/step3') {
      setCurrentStep(3)
    }
  }, [pathname, setCurrentStep])

  const handlePrevious = () => {
    if (state.currentStep > 1) {
      const newStep = state.currentStep - 1
      setCurrentStep(newStep)
      router.push(`/step${newStep}`)
    }
  }

  const handleNext = () => {
    if (state.currentStep < 3) {
      const newStep = state.currentStep + 1
      setCurrentStep(newStep)
      router.push(`/step${newStep}`)
    }
  }

  const canGoNext = () => {
    switch (state.currentStep) {
      case 1:
        return state.step1Data.ocrResults.length > 0
      case 2:
        return state.step2Data.attendeeResults !== null
      case 3:
        return false // No next step after step 3
      default:
        return false
    }
  }

  const canGoPrevious = state.currentStep > 1

  const isSequentialWorkflow = pathname.startsWith('/step') || pathname === '/'
  const isMultiPdfPage = pathname === '/multi-pdf'
  const isParallelPage = pathname === '/parallel'

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-6">
        <h1 className="text-xl font-semibold text-gray-800">
          Vote Tracking System
        </h1>
        
        {/* Navigation Menu */}
        <nav className="flex space-x-4">
          <button
            onClick={() => router.push('/step1')}
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              isSequentialWorkflow 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Sequential Workflow
          </button>
          <button
            onClick={() => router.push('/multi-pdf')}
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              isMultiPdfPage 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Multi-PDF Processing
          </button>
          <button
            onClick={() => router.push('/parallel')}
            className={`px-3 py-2 text-sm font-medium rounded-md ${
              isParallelPage 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Single PDF Parallel
          </button>
        </nav>
      </div>
      
      {/* Only show step navigation on sequential workflow pages */}
      {isSequentialWorkflow && (
        <div className="flex items-center space-x-4">
          {/* Step Indicator */}
          <div className="text-sm text-gray-600">
            Step {state.currentStep} of 3
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            <button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}