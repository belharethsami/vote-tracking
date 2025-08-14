'use client'

import { useState, useEffect } from 'react'
import { useApp } from '../components/AppContext'

interface ProcessingResult {
  page: number
  response?: any
  error?: string
}

interface ApiResponse {
  success: boolean
  total_pages: number
  results: ProcessingResult[]
}

export default function Step1() {
  const { state, setApiKey, setStep1Data } = useApp()
  const [file, setFile] = useState<File | null>(state.step1Data.pdfFile)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ApiResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setFile(state.step1Data.pdfFile)
  }, [state.step1Data.pdfFile])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile)
      setStep1Data({ pdfFile: selectedFile })
      setError('')
    } else {
      setError('Please select a valid PDF file')
      setFile(null)
      setStep1Data({ pdfFile: null })
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

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', state.apiKey)

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/process-pdf`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process PDF')
      }

      const data: ApiResponse = await response.json()
      setResults(data)

      // Extract text from all pages and store in context
      const allText = data.results
        .filter(result => result.response && !result.error)
        .map(result => {
          try {
            const parsed = JSON.parse(result.response)
            return parsed.text || result.response
          } catch {
            return result.response
          }
        })
        .join('\n\n')

      setStep1Data({ ocrResults: allText })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          PDF OCR
        </h1>
        <p className="text-lg text-gray-600">
          Upload a PDF file to extract text using OCR
        </p>
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
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Process PDF'}
          </button>
        </form>
      </div>

      {loading && (
        <div className="mt-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Processing your PDF...</p>
        </div>
      )}

      {results && (
        <div className="mt-8 bg-white shadow-lg rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            OCR Results
          </h2>
          <p className="text-gray-600 mb-6">
            Processed {results.total_pages} pages
          </p>

          <div className="space-y-6">
            {results.results.map((result, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Page {result.page}
                </h3>
                
                {result.error ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-red-600">{result.error}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-md p-4">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                      {JSON.stringify(result.response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 text-sm">
              ✓ Text extracted successfully! You can now proceed to the next step to extract meeting attendees.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}