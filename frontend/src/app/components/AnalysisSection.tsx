'use client'

import { useState } from 'react'
import { useApp } from './AppContext'

export function AnalysisSection() {
  const { 
    state, 
    setResults, 
    setStepStatus
  } = useApp()
  
  const [error, setError] = useState('')

  const handleAnalysisProcess = async () => {
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }

    if (!state.rubric.trim()) {
      setError('Please enter a rubric in Step 0')
      return
    }

    const validResults = state.results.filter(result => result.success && result.extractedText)
    if (validResults.length === 0) {
      setError('Please complete OCR processing first (Step 1)')
      return
    }

    setStepStatus(2, 'processing')
    setError('')
    
    try {
      const entries = validResults.map(result => ({
        filename: result.filename,
        text: result.extractedText || ''
      }))

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/analyze-laws-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries,
          rubric: state.rubric,
          api_key: state.apiKey
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to analyze laws')
      }

      const data = await response.json()
      
      // Update results with law analysis data
      const updates = state.results.map(result => {
        const match = data.results.find((r: { filename: string }) => r.filename === result.filename)
        if (match && match.success) {
          return { ...result, lawAnalysis: match.law_analysis }
        } else if (match && !match.success) {
          return { ...result, lawAnalysisError: match.error }
        }
        return result
      })
      
      setResults(updates)
      setStepStatus(2, 'complete')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(2, 'error')
      
      // Update results with error
      const updates = state.results.map(result => {
        if (result.success && result.extractedText) {
          return { ...result, lawAnalysisError: err instanceof Error ? err.message : 'An error occurred' }
        }
        return result
      })
      setResults(updates)
    }
  }

  const canProceedToAnalysis = state.step1Status === 'complete' && 
                               state.results.some(r => r.success && r.extractedText) && 
                               state.rubric.trim()

  return (
    <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Step 2: AI Analysis</h2>
        <div className="flex items-center space-x-2">
          {state.step2Status === 'complete' && (
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
              Complete
            </span>
          )}
          {state.step2Status === 'processing' && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
              Processing...
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleAnalysisProcess}
        disabled={state.step2Status === 'processing' || !canProceedToAnalysis}
        className="mb-4 bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {state.step2Status === 'processing' ? 'Analyzing Documents...' : 'Analyze Documents with AI'}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {state.step1Status === 'complete' && state.results.some(r => r.lawAnalysis || r.lawAnalysisError) && (
        <div className="space-y-4">
          {state.results.map((result, index) => (
            result.success && (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">{result.filename}</h3>
                
                {result.lawAnalysis != null && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Law Analysis Results (scrollable):
                    </label>
                    <div className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md bg-orange-50 overflow-y-auto">
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                        {JSON.stringify(result.lawAnalysis, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {result.lawAnalysisError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-red-600">{result.lawAnalysisError}</p>
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}