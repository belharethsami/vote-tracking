'use client'

import { useState } from 'react'
import { useApp } from './components/AppContext'
import { PdfUploadSection } from './components/PdfUploadSection'
import { OcrProcessingSection } from './components/OcrProcessingSection'

export default function Home() {
  const { 
    state, 
    setResults, 
    setStepStatus
  } = useApp()
  
  const [step2Error, setStep2Error] = useState('')
  const [step3Error, setStep3Error] = useState('')

  const handleStep2Process = async () => {
    if (!state.apiKey) {
      setStep2Error('Please enter your API key')
      return
    }

    setStepStatus(2, 'processing')
    setStep2Error('')
    
    try {
      const entries = state.results
        .filter(result => result.success && result.extractedText)
        .map(result => ({
          filename: result.filename,
          text: result.extractedText || ''
        }))

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/extract-attendees-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries,
          api_key: state.apiKey
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to extract attendees')
      }

      const data = await response.json()
      
      // Update results with attendee data
      const updates = state.results.map(result => {
        const match = data.results.find((r: { filename: string }) => r.filename === result.filename)
        if (match && match.success) {
          return { ...result, attendees: match.attendees }
        } else if (match && !match.success) {
          return { ...result, attendeesError: match.error }
        }
        return result
      })
      
      setResults(updates)
      setStepStatus(2, 'complete')
      
    } catch (err) {
      setStep2Error(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(2, 'error')
    }
  }

  const handleStep3Process = async () => {
    if (!state.apiKey) {
      setStep3Error('Please enter your API key')
      return
    }

    setStepStatus(3, 'processing')
    setStep3Error('')
    
    try {
      const entries = state.results
        .filter(result => result.success && result.extractedText)
        .map(result => ({
          filename: result.filename,
          text: result.extractedText || ''
        }))

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/extract-vote-patterns-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries,
          api_key: state.apiKey
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to extract vote patterns')
      }

      const data = await response.json()
      
      // Update results with vote pattern data
      const updates = state.results.map(result => {
        const match = data.results.find((r: { filename: string }) => r.filename === result.filename)
        if (match && match.success) {
          return { ...result, votePatterns: match.vote_patterns }
        } else if (match && !match.success) {
          return { ...result, votePatternsError: match.error }
        }
        return result
      })
      
      setResults(updates)
      setStepStatus(3, 'complete')
      
    } catch (err) {
      setStep3Error(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(3, 'error')
    }
  }


  const canProceedToStep2 = state.step1Status === 'complete' && state.results.some(r => r.success)
  const canProceedToStep3 = state.step2Status === 'complete' && state.results.some(r => r.attendees)

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          PDF Vote Tracking System
        </h1>
        <p className="text-lg text-gray-600">
          Upload one or multiple PDF files and process them through OCR, attendee extraction, and vote pattern analysis.
        </p>
      </div>

      <PdfUploadSection />
      <OcrProcessingSection />

      {/* Step 2: Attendee Extraction */}
      <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Step 2: Extract Attendees</h2>
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
          onClick={handleStep2Process}
          disabled={state.step2Status === 'processing' || !canProceedToStep2}
          className="mb-4 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {state.step2Status === 'processing' ? 'Extracting Attendees...' : 'Extract Meeting Attendees'}
        </button>

        {step2Error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-600">{step2Error}</p>
          </div>
        )}

        {state.step1Status === 'complete' && state.results.some(r => r.attendees || r.attendeesError) && (
          <div className="space-y-4">
            {state.results.map((result, index) => (
              result.success && (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{result.filename}</h3>
                  
                  {result.attendees != null && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Attendees (scrollable):
                      </label>
                      <div className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md bg-blue-50 overflow-y-auto">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(result.attendees, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {result.attendeesError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                      <p className="text-red-600">{result.attendeesError}</p>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* Step 3: Vote Pattern Extraction */}
      <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Step 3: Extract Vote Patterns</h2>
          <div className="flex items-center space-x-2">
            {state.step3Status === 'complete' && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                Complete
              </span>
            )}
            {state.step3Status === 'processing' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                Processing...
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleStep3Process}
          disabled={state.step3Status === 'processing' || !canProceedToStep3}
          className="mb-4 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {state.step3Status === 'processing' ? 'Extracting Vote Patterns...' : 'Extract Vote Patterns'}
        </button>

        {step3Error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-600">{step3Error}</p>
          </div>
        )}

        {state.step2Status === 'complete' && state.results.some(r => r.votePatterns || r.votePatternsError) && (
          <div className="space-y-4">
            {state.results.map((result, index) => (
              result.success && (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{result.filename}</h3>
                  
                  {result.votePatterns != null && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Vote Patterns (scrollable):
                      </label>
                      <div className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md bg-purple-50 overflow-y-auto">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(result.votePatterns, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {result.votePatternsError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                      <p className="text-red-600">{result.votePatternsError}</p>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
