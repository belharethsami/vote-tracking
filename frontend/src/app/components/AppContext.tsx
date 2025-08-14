'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

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

  const value: AppContextType = {
    state,
    updateState,
    setCurrentStep,
    setApiKey,
    setStep1Data,
    setStep2Data,
    setStep3Data
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