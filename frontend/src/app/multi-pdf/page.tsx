'use client'

import { useState } from 'react'
import { useApp } from '../components/AppContext'

export default function MultiPdfProcessing() {
  const { 
    state, 
    setApiKey, 
    setMultiPdfFiles, 
    setMultiPdfResults, 
    setMultiPdfStatus,
    setMultiPdfProcessingTime,
    clearMultiPdfData 
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
    setMultiPdfFiles(pdfFiles)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }
    
    if (selectedFiles.length === 0) {
      setError('Please select at least one PDF file')
      return
    }

    setMultiPdfStatus('processing')
    setError('')
    clearMultiPdfData()
    
    const startTime = performance.now()

    try {
      const formData = new FormData()
      selectedFiles.forEach(file => {
        formData.append('files', file)
      })
      formData.append('api_key', state.apiKey)

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/process-multiple-pdfs`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process PDFs')
      }

      const data = await response.json()
      
      const endTime = performance.now()
      const clientProcessingTime = Math.round(endTime - startTime)
      
      setMultiPdfResults(data.results)
      setMultiPdfProcessingTime(data.processing_time_ms)
      setMultiPdfStatus('complete')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setMultiPdfStatus('error')
    }
  }

  const handleClear = () => {
    setSelectedFiles([])
    clearMultiPdfData()
    setError('')
  }

  const isProcessing = state.multiPdfData.processingStatus === 'processing'

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Multi-PDF Processing
        </h1>
        <p className="text-lg text-gray-600">
          Upload multiple PDF files and process them all in parallel through OCR, attendee extraction, and vote pattern analysis.
        </p>
      </div>

      <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
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
              required
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
              required
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
              type="submit"
              disabled={isProcessing || !state.apiKey || selectedFiles.length === 0}
              className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isProcessing ? 'Processing...' : `Process ${selectedFiles.length} PDFs`}
            </button>
            
            <button
              type="button"
              onClick={handleClear}
              disabled={isProcessing}
              className="bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {isProcessing && (
        <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-4"></div>
            <p className="text-lg text-gray-600">
              Processing {selectedFiles.length} PDFs in parallel...
            </p>
          </div>
        </div>
      )}

      {state.multiPdfData.results.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white shadow-lg rounded-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Processing Results</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {state.multiPdfData.results.length}
                </div>
                <div className="text-sm text-gray-600">Files Processed</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">
                  {state.multiPdfData.results.filter(r => r.success).length}
                </div>
                <div className="text-sm text-gray-600">Successful</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {state.multiPdfData.processingTimeMs ? `${state.multiPdfData.processingTimeMs}ms` : 'N/A'}
                </div>
                <div className="text-sm text-gray-600">Total Time</div>
              </div>
            </div>
          </div>

          {state.multiPdfData.results.map((result, index) => (
            <div key={index} className="bg-white shadow-lg rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">{result.filename}</h3>
                <div className="flex items-center space-x-2">
                  {result.success ? (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                      Success
                    </span>
                  ) : (
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-medium">
                      Failed
                    </span>
                  )}
                  {result.processingTimeMs && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                      {result.processingTimeMs}ms
                    </span>
                  )}
                </div>
              </div>

              {result.error ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-600">{result.error}</p>
                </div>
              ) : result.success ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">
                      OCR Results ({result.totalPages} pages)
                    </h4>
                    <div className="bg-gray-50 rounded-md p-4 max-h-40 overflow-y-auto">
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                        {result.extractedText?.substring(0, 500)}
                        {result.extractedText && result.extractedText.length > 500 ? '...' : ''}
                      </pre>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">Attendees</h4>
                    {result.attendeesError ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-4">
                        <p className="text-red-600">{result.attendeesError}</p>
                      </div>
                    ) : (
                      <div className="bg-blue-50 rounded-md p-4">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(result.attendees, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">Vote Patterns</h4>
                    {result.votePatternsError ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-4">
                        <p className="text-red-600">{result.votePatternsError}</p>
                      </div>
                    ) : (
                      <div className="bg-purple-50 rounded-md p-4">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(result.votePatterns, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}