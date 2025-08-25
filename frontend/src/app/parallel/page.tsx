'use client'

import { useState } from 'react'
import { useApp } from '../components/AppContext'

interface PipelineResponse {
  success: boolean
  total_pages: number
  ocr_results: {
    total_pages: number
    results: Array<{
      page: number
      response?: string
      error?: string
    }>
  }
  extracted_text: string
  attendees?: string
  vote_patterns?: string
  attendees_error?: string
  vote_patterns_error?: string
}

export default function ParallelProcessing() {
  const { state, setApiKey } = useApp()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PipelineResponse | null>(null)
  const [error, setError] = useState('')
  const [processingTime, setProcessingTime] = useState<number | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile)
      setError('')
    } else {
      setError('Please select a valid PDF file')
      setFile(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }
    
    if (!file) {
      setError('Please select a PDF file')
      return
    }

    setLoading(true)
    setError('')
    setResults(null)
    
    const startTime = performance.now()

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', state.apiKey)

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/process-complete-pipeline`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process PDF')
      }

      const data: PipelineResponse = await response.json()
      setResults(data)
      
      const endTime = performance.now()
      setProcessingTime(Math.round(endTime - startTime))
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          ⚡ Ultra-Fast Parallel Processing
        </h1>
        <p className="text-lg text-gray-600">
          Process PDF through OCR, attendee extraction, and vote pattern analysis - all in parallel!
        </p>
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 text-sm font-medium">
            🚀 This processes all PDF pages simultaneously + runs Steps 2 & 3 in parallel
          </p>
        </div>
      </div>

      <div className="bg-white shadow-lg rounded-lg p-8">
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
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
              PDF File
            </label>
            <div className="w-full border border-gray-300 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
              <input
                type="file"
                id="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
                required
              />
              <label 
                htmlFor="file" 
                className="flex items-center justify-between w-full px-3 py-2 cursor-pointer"
              >
                <span className={file ? 'bg-blue-100 px-2 py-1 rounded text-black font-medium' : 'text-gray-500 italic'}>
                  {file ? file.name : 'No file chosen'}
                </span>
                <span className="bg-gray-200 px-3 py-1 rounded text-black text-sm font-medium">
                  Browse
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !state.apiKey || !file}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 rounded-md hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? '⚡ Processing in Parallel...' : '🚀 Ultra-Fast Process'}
          </button>
        </form>
      </div>

      {loading && (
        <div className="mt-8 text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-purple-600"></div>
          <p className="mt-4 text-lg text-gray-600 font-medium">
            ⚡ Processing all pages and steps in parallel...
          </p>
          <p className="mt-2 text-sm text-gray-500">
            OCR + Attendee Extraction + Vote Pattern Analysis running simultaneously
          </p>
        </div>
      )}

      {results && (
        <div className="mt-8 space-y-6">
          {/* Performance Metrics */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 shadow-lg rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                ⚡ Performance Results
              </h2>
              {processingTime && (
                <div className="bg-white px-4 py-2 rounded-full shadow-md">
                  <span className="text-lg font-bold text-green-600">
                    {processingTime}ms
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-2xl font-bold text-blue-600">{results.total_pages}</div>
                <div className="text-sm text-gray-600">Pages Processed</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-2xl font-bold text-green-600">3</div>
                <div className="text-sm text-gray-600">Steps Completed</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-2xl font-bold text-purple-600">∞</div>
                <div className="text-sm text-gray-600">Parallel Execution</div>
              </div>
            </div>
          </div>

          {/* OCR Results */}
          <div className="bg-white shadow-lg rounded-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              📄 OCR Results ({results.ocr_results.total_pages} pages)
            </h3>
            <div className="bg-gray-50 rounded-md p-4 max-h-60 overflow-y-auto">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                {results.extracted_text}
              </pre>
            </div>
          </div>

          {/* Attendees Results */}
          <div className="bg-white shadow-lg rounded-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              👥 Meeting Attendees
            </h3>
            {results.attendees_error ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-600">{results.attendees_error}</p>
              </div>
            ) : (
              <div className="bg-blue-50 rounded-md p-4">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                  {JSON.stringify(results.attendees, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Vote Patterns Results */}
          <div className="bg-white shadow-lg rounded-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              🗳️ Vote Patterns Analysis
            </h3>
            {results.vote_patterns_error ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-600">{results.vote_patterns_error}</p>
              </div>
            ) : (
              <div className="bg-purple-50 rounded-md p-4">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                  {JSON.stringify(results.vote_patterns, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">✓</span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-green-800 font-medium">
                  🚀 Ultra-fast parallel processing complete! All steps executed simultaneously.
                </p>
                <p className="text-green-600 text-sm mt-1">
                  Processed {results.total_pages} pages with OCR, attendee extraction, and vote analysis in parallel.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}