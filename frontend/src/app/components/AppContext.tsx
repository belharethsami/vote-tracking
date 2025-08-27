'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface PdfResult {
  filename: string
  success: boolean
  totalPages?: number
  ocrResults?: {
    totalPages: number
    results: Array<{
      page: number
      response?: string
      error?: string
    }>
  }
  extractedText?: string
  attendees?: unknown
  votePatterns?: unknown
  lawAnalysis?: unknown
  processingTimeMs?: number
  attendeesError?: string
  votePatternsError?: string
  lawAnalysisError?: string
  error?: string
}

export interface AppState {
  apiKey: string
  files: File[]
  results: PdfResult[]
  rubric: string
  currentStep: number
  step0Status: 'idle' | 'complete'
  step1Status: 'idle' | 'processing' | 'complete' | 'error'
  step2Status: 'idle' | 'processing' | 'complete' | 'error'  
  step3Status: 'idle' | 'processing' | 'complete' | 'error'
}

interface AppContextType {
  state: AppState
  updateState: (updates: Partial<AppState>) => void
  setCurrentStep: (step: number) => void
  setApiKey: (key: string) => void
  setFiles: (files: File[]) => void
  setResults: (results: PdfResult[]) => void
  updateResults: (results: Partial<PdfResult>[]) => void
  setRubric: (rubric: string) => void
  setStepStatus: (step: 1 | 2 | 3, status: 'idle' | 'processing' | 'complete' | 'error') => void
  clearData: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const initialState: AppState = {
  apiKey: '',
  files: [],
  results: [],
  rubric: '',
  currentStep: 1,
  step0Status: 'idle',
  step1Status: 'idle',
  step2Status: 'idle',
  step3Status: 'idle'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState)

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  const setCurrentStep = useCallback((step: number) => {
    setState(prev => {
      if (prev.currentStep === step) return prev // Prevent unnecessary updates
      return { ...prev, currentStep: step }
    })
  }, [])

  const setApiKey = useCallback((key: string) => {
    setState(prev => ({ ...prev, apiKey: key }))
  }, [])

  const setFiles = useCallback((files: File[]) => {
    setState(prev => ({ ...prev, files }))
  }, [])

  const setResults = useCallback((results: PdfResult[]) => {
    setState(prev => ({ ...prev, results }))
  }, [])

  const setRubric = useCallback((rubric: string) => {
    setState(prev => ({ 
      ...prev, 
      rubric,
      step0Status: rubric.trim() ? 'complete' : 'idle'
    }))
  }, [])

  const updateResults = useCallback((updates: Partial<PdfResult>[]) => {
    setState(prev => {
      const newResults = [...prev.results]
      updates.forEach((update, index) => {
        if (index < newResults.length) {
          newResults[index] = { ...newResults[index], ...update }
        }
      })
      return { ...prev, results: newResults }
    })
  }, [])

  const setStepStatus = useCallback((step: 1 | 2 | 3, status: 'idle' | 'processing' | 'complete' | 'error') => {
    setState(prev => ({
      ...prev,
      [`step${step}Status`]: status
    }))
  }, [])

  const clearData = useCallback(() => {
    setState(prev => ({
      ...prev,
      files: [],
      results: [],
      rubric: '',
      step0Status: 'idle',
      step1Status: 'idle',
      step2Status: 'idle',
      step3Status: 'idle'
    }))
  }, [])

  const value: AppContextType = {
    state,
    updateState,
    setCurrentStep,
    setApiKey,
    setFiles,
    setResults,
    updateResults,
    setRubric,
    setStepStatus,
    clearData
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextType {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}