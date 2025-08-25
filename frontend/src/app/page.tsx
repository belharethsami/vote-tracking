'use client'

import { useState } from 'react'
import { useApp } from './components/AppContext'

export default function Home() {
  const { 
    state, 
    setApiKey, 
    setFiles, 
    setResults, 
    updateResults,
    setStepStatus,
    clearData,
    setCurrentStep
  } = useApp()
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const pdfFiles = files.filter(file => file.type === 'application/pdf')
    
    if (pdfFiles.length !== files.length) {
      setError('Only PDF files are allowed')
      return
    }
    
    setSelectedFiles(pdfFiles)
    setFiles(pdfFiles)
    setError('')
    
    // Initialize results with filenames
    const initialResults = pdfFiles.map(file => ({
      filename: file.name,
      success: false,
      extractedText: ''
    }))
    setResults(initialResults)
  }

  const handleStep1Process = async () => {
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }
    
    if (selectedFiles.length === 0) {
      setError('Please select at least one PDF file')
      return
    }

    setStepStatus(1, 'processing')
    setError('')
    
    try {
      const formData = new FormData()
      selectedFiles.forEach(file => {
        formData.append('files', file)
      })
      formData.append('api_key', state.apiKey)

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/process-pdfs`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process PDFs')
      }

      const data = await response.json()
      
      // Update results with OCR data
      const updates = data.results.map((result: any) => ({
        ...result,
        totalPages: result.total_pages,
        ocrResults: result.ocr_results,
        extractedText: result.extracted_text
      }))
      
      setResults(updates)
      setStepStatus(1, 'complete')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(1, 'error')
    }
  }

  const handleStep2Process = async () => {
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }

    setStepStatus(2, 'processing')
    setError('')
    
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
        const match = data.results.find((r: any) => r.filename === result.filename)
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
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(2, 'error')
    }
  }

  const handleStep3Process = async () => {
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }

    setStepStatus(3, 'processing')
    setError('')
    
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
        const match = data.results.find((r: any) => r.filename === result.filename)
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
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(3, 'error')
    }
  }

  const handleClear = () => {
    setSelectedFiles([])
    clearData()
    setError('')
    setCurrentStep(1)
  }

  const handleTextEdit = (filename: string, field: 'extractedText', value: string) => {
    const updates = state.results.map(result => {
      if (result.filename === filename) {
        return { ...result, [field]: value }
      }
      return result
    })
    setResults(updates)
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

      {/* File Upload Section */}
      <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upload PDFs</h2>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              id="apiKey"
              value={state.apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
              placeholder="Enter your API key..."
            />
          </div>

          <div>
            <label htmlFor="files" className="block text-sm font-medium text-gray-700 mb-2">
              PDF Files
            </label>
            <input
              type="file"
              id="files"
              multiple
              accept=".pdf"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
            />
            
            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">Selected files ({selectedFiles.length}):</p>
                <div className="max-h-32 overflow-y-auto">
                  <ul className="space-y-1">
                    {selectedFiles.map((file, index) => (
                      <li key={index} className="text-sm bg-gray-50 px-3 py-2 rounded">
                        {file.name} ({Math.round(file.size / 1024)}KB)
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              onClick={handleClear}
              className="bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 font-medium"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Step 1: OCR Processing */}
      <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Step 1: PDF OCR</h2>
          <div className="flex items-center space-x-2">
            {state.step1Status === 'complete' && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                Complete
              </span>
            )}
            {state.step1Status === 'processing' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                Processing...
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleStep1Process}
          disabled={state.step1Status === 'processing' || !state.apiKey || selectedFiles.length === 0}
          className="mb-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {state.step1Status === 'processing' ? 'Processing OCR...' : `Process ${selectedFiles.length} PDF(s) with OCR`}
        </button>

        {state.results.length > 0 && (
          <div className="space-y-4">
            {state.results.map((result, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{result.filename}</h3>
                  {result.success ? (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                      Success ({result.totalPages} pages)
                    </span>
                  ) : (
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                      Failed
                    </span>
                  )}
                </div>
                
                {result.success && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Extracted Text (scrollable/editable):
                    </label>
                    <textarea
                      value={result.extractedText || ''}
                      onChange={(e) => handleTextEdit(result.filename, 'extractedText', e.target.value)}
                      className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black resize-none overflow-y-auto"
                      placeholder="OCR extracted text will appear here..."
                    />
                  </div>
                )}

                {result.error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 mt-2">
                    <p className="text-red-600">{result.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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

        {state.step1Status === 'complete' && state.results.some(r => r.attendees || r.attendeesError) && (
          <div className="space-y-4">
            {state.results.map((result, index) => (
              result.success && (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{result.filename}</h3>
                  
                  {result.attendees && (
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

        {state.step2Status === 'complete' && state.results.some(r => r.votePatterns || r.votePatternsError) && (
          <div className="space-y-4">
            {state.results.map((result, index) => (
              result.success && (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{result.filename}</h3>
                  
                  {result.votePatterns && (
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
