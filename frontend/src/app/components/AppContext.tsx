'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface MultiPdfResult {
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
  attendees?: any
  votePatterns?: any
  processingTimeMs?: number
  attendeesError?: string
  votePatternsError?: string
  error?: string
}

export interface AppState {
  apiKey: string
  step1Data: {
    pdfFile: File | null
    ocrResults: string
  }
  step2Data: {
    inputText: string
    attendeeResults: any
  }
  step3Data: {
    inputText: string
    voteResults: any
  }
  multiPdfData: {
    files: File[]
    results: MultiPdfResult[]
    processingStatus: 'idle' | 'processing' | 'complete' | 'error'
    processingTimeMs?: number
  }
  currentStep: number
}

interface AppContextType {
  state: AppState
  updateState: (updates: Partial<AppState>) => void
  setCurrentStep: (step: number) => void
  setApiKey: (key: string) => void
  setStep1Data: (data: Partial<AppState['step1Data']>) => void
  setStep2Data: (data: Partial<AppState['step2Data']>) => void
  setStep3Data: (data: Partial<AppState['step3Data']>) => void
  setMultiPdfFiles: (files: File[]) => void
  setMultiPdfResults: (results: MultiPdfResult[]) => void
  setMultiPdfStatus: (status: 'idle' | 'processing' | 'complete' | 'error') => void
  setMultiPdfProcessingTime: (time: number) => void
  clearMultiPdfData: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const initialState: AppState = {
  apiKey: '',
  step1Data: {
    pdfFile: null,
    ocrResults: ''
  },
  step2Data: {
    inputText: '',
    attendeeResults: null
  },
  step3Data: {
    inputText: '',
    voteResults: null
  },
  multiPdfData: {
    files: [],
    results: [],
    processingStatus: 'idle'
  },
  currentStep: 1
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

  const setStep1Data = useCallback((data: Partial<AppState['step1Data']>) => {
    setState(prev => ({ 
      ...prev, 
      step1Data: { ...prev.step1Data, ...data }
    }))
  }, [])

  const setStep2Data = useCallback((data: Partial<AppState['step2Data']>) => {
    setState(prev => ({ 
      ...prev, 
      step2Data: { ...prev.step2Data, ...data }
    }))
  }, [])

  const setStep3Data = useCallback((data: Partial<AppState['step3Data']>) => {
    setState(prev => ({ 
      ...prev, 
      step3Data: { ...prev.step3Data, ...data }
    }))
  }, [])

  const setMultiPdfFiles = useCallback((files: File[]) => {
    setState(prev => ({
      ...prev,
      multiPdfData: { ...prev.multiPdfData, files }
    }))
  }, [])

  const setMultiPdfResults = useCallback((results: MultiPdfResult[]) => {
    setState(prev => ({
      ...prev,
      multiPdfData: { ...prev.multiPdfData, results }
    }))
  }, [])

  const setMultiPdfStatus = useCallback((status: 'idle' | 'processing' | 'complete' | 'error') => {
    setState(prev => ({
      ...prev,
      multiPdfData: { ...prev.multiPdfData, processingStatus: status }
    }))
  }, [])

  const setMultiPdfProcessingTime = useCallback((time: number) => {
    setState(prev => ({
      ...prev,
      multiPdfData: { ...prev.multiPdfData, processingTimeMs: time }
    }))
  }, [])

  const clearMultiPdfData = useCallback(() => {
    setState(prev => ({
      ...prev,
      multiPdfData: {
        files: [],
        results: [],
        processingStatus: 'idle'
      }
    }))
  }, [])

  const value: AppContextType = {
    state,
    updateState,
    setCurrentStep,
    setApiKey,
    setStep1Data,
    setStep2Data,
    setStep3Data,
    setMultiPdfFiles,
    setMultiPdfResults,
    setMultiPdfStatus,
    setMultiPdfProcessingTime,
    clearMultiPdfData
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