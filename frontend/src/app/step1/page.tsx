'use client'

import { useState, useEffect } from 'react'
import { useApp } from '../components/AppContext'

interface ProcessingResult {
  page: number
  response?: any
  error?: string
  source_file?: string
}

interface ProgressData {
  total_files: number
  files_started: number
  files_completed: number
  total_pages: number
  pages_completed: number
  pdf_results: Array<{
    filename: string
    success: boolean
    total_pages: number
    results: ProcessingResult[]
  }>
  failed_files: Array<{filename: string, error: string}>
}

interface ApiResponse {
  success: boolean
  total_files: number
  total_pages_processed: number
  failed_files: Array<{filename: string, error: string}>
  pdf_results: Array<{
    filename: string
    success: boolean
    total_pages: number
    results: ProcessingResult[]
  }>
  concatenated_text: string
}

export default function Step1() {
  const { state, setApiKey, setStep1Data } = useApp()
  const [files, setFiles] = useState<File[]>(state.step1Data.pdfFiles)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ApiResponse | null>(null)
  const [error, setError] = useState('')
  const [useProgressTracking, setUseProgressTracking] = useState(true)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [fileProgress, setFileProgress] = useState<Record<string, {
    started: boolean
    completed: boolean
    totalPages: number
    pagesCompleted: number
    failed: boolean
    error?: string
  }>>({})

  useEffect(() => {
    setFiles(state.step1Data.pdfFiles)
  }, [state.step1Data.pdfFiles])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const pdfFiles = selectedFiles.filter(file => file.type === 'application/pdf')
    
    if (selectedFiles.length > 0 && pdfFiles.length === selectedFiles.length) {
      setFiles(pdfFiles)
      setStep1Data({ pdfFiles })
      setError('')
    } else if (selectedFiles.length > 0 && pdfFiles.length < selectedFiles.length) {
      setError('All selected files must be PDF files')
      setFiles([])
      setStep1Data({ pdfFiles: [] })
    } else {
      setError('Please select at least one PDF file')
      setFiles([])
      setStep1Data({ pdfFiles: [] })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }
    
    if (files.length === 0) {
      setError('Please select at least one PDF file')
      return
    }

    setLoading(true)
    setError('')
    setResults(null)
    setProgress(null)
    setFileProgress({})

    try {
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })
      formData.append('api_key', state.apiKey)

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      
      if (useProgressTracking) {
        // Use SSE for progress tracking
        const response = await fetch(`${backendUrl}/process-multiple-pdfs-stream`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Failed to process PDFs')
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('Failed to get response reader')
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6))
                
                if (eventData.event_type === 'error') {
                  throw new Error(eventData.data.error)
                }
                
                if (eventData.event_type === 'pdf_started') {
                  setFileProgress(prev => ({
                    ...prev,
                    [eventData.data.filename]: {
                      started: true,
                      completed: false,
                      totalPages: eventData.data.total_pages,
                      pagesCompleted: 0,
                      failed: false
                    }
                  }))
                }
                
                if (eventData.event_type === 'page_completed') {
                  setFileProgress(prev => ({
                    ...prev,
                    [eventData.data.filename]: {
                      ...prev[eventData.data.filename],
                      pagesCompleted: (prev[eventData.data.filename]?.pagesCompleted || 0) + 1
                    }
                  }))
                }
                
                if (eventData.event_type === 'pdf_completed') {
                  setFileProgress(prev => ({
                    ...prev,
                    [eventData.data.filename]: {
                      ...prev[eventData.data.filename],
                      completed: true,
                      failed: !eventData.data.success,
                      error: eventData.data.error
                    }
                  }))
                }
                
                if (eventData.progress) {
                  setProgress(eventData.progress)
                }
                
                if (eventData.event_type === 'all_completed') {
                  setResults(eventData.data)
                  setStep1Data({ ocrResults: eventData.data.concatenated_text })
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', parseError)
              }
            }
          }
        }
      } else {
        // Use batch processing (original method)
        const response = await fetch(`${backendUrl}/process-multiple-pdfs`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Failed to process PDFs')
        }

        const data: ApiResponse = await response.json()
        setResults(data)
        setStep1Data({ ocrResults: data.concatenated_text })
      }
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
          Upload PDF files to extract text using OCR
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
            <label htmlFor="files" className="block text-sm font-medium text-gray-700 mb-2">
              PDF Files
            </label>
            <div className="w-full border border-gray-300 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
              <input
                type="file"
                id="files"
                accept=".pdf"
                multiple
                onChange={handleFileChange}
                className="hidden"
                required
              />
              <label 
                htmlFor="files" 
                className="flex items-center justify-between w-full px-3 py-2 cursor-pointer"
              >
                <span className={files.length > 0 ? 'text-black' : 'text-gray-500 italic'}>
                  {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'No files chosen'}
                </span>
                <span className="bg-gray-200 px-3 py-1 rounded text-black text-sm font-medium">
                  Browse
                </span>
              </label>
            </div>
            
            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-sm font-medium text-gray-700">Selected files:</p>
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded">
                    <span className="text-sm text-black font-medium">{file.name}</span>
                    <span className="text-xs text-gray-600">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={useProgressTracking}
                onChange={(e) => setUseProgressTracking(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Show real-time progress</span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !state.apiKey || files.length === 0}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : `Process ${files.length} PDF${files.length !== 1 ? 's' : ''}`}
          </button>
        </form>
      </div>

      {loading && (
        <div className="mt-8">
          <div className="text-center mb-6">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Processing {files.length} PDF{files.length !== 1 ? 's' : ''} in parallel...</p>
          </div>
          
          {useProgressTracking && progress && (
            <div className="bg-white shadow-lg rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing Progress</h3>
              
              {/* Overall Progress */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Overall Progress</span>
                  <span>{progress.pages_completed} / {progress.total_pages} pages</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total_pages > 0 ? (progress.pages_completed / progress.total_pages) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              {/* Files Progress */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-800">Files ({progress.files_completed} / {progress.total_files} completed)</h4>
                {files.map((file, index) => {
                  const fileInfo = fileProgress[file.name] || {
                    started: false,
                    completed: false,
                    totalPages: 0,
                    pagesCompleted: 0,
                    failed: false
                  }
                  
                  const isStarted = fileInfo.started
                  const isCompleted = fileInfo.completed
                  const totalPages = fileInfo.totalPages
                  const pagesCompleted = fileInfo.pagesCompleted

                  return (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{file.name}</span>
                        <span className="text-xs text-gray-500">
                          {fileInfo.failed ? '❌ Failed' : isCompleted ? '✅ Complete' : isStarted ? '🔄 Processing' : '⏳ Waiting'}
                        </span>
                      </div>
                      
                      {totalPages > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Pages</span>
                            <span>{pagesCompleted} / {totalPages}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1">
                            <div 
                              className="bg-green-500 h-1 rounded-full transition-all duration-300"
                              style={{ width: `${totalPages > 0 ? (pagesCompleted / totalPages) * 100 : 0}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="mt-8 bg-white shadow-lg rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            OCR Results
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Files Processed</p>
              <p className="text-2xl font-bold text-blue-900">{results.total_files}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Total Pages</p>
              <p className="text-2xl font-bold text-green-900">{results.total_pages_processed}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-red-600 font-medium">Failed Files</p>
              <p className="text-2xl font-bold text-red-900">{results.failed_files.length}</p>
            </div>
          </div>

          {results.failed_files.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-red-900 mb-3">Failed Files</h3>
              <div className="space-y-2">
                {results.failed_files.map((failedFile, index) => (
                  <div key={index} className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="font-medium text-red-800">{failedFile.filename}</p>
                    <p className="text-sm text-red-600">{failedFile.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {results.pdf_results
              .filter(pdf => pdf.success)
              .map((pdf, pdfIndex) => (
                <div key={pdfIndex} className="border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    📄 {pdf.filename}
                    <span className="ml-2 text-sm text-gray-600 font-normal">({pdf.total_pages} pages)</span>
                  </h3>
                  
                  <div className="grid gap-4">
                    {pdf.results.map((result, index) => (
                      <div key={index} className="bg-gray-50 rounded-md p-4">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-medium text-gray-700">Page {result.page}</h4>
                        </div>
                        
                        {result.error ? (
                          <div className="bg-red-50 border border-red-200 rounded-md p-3">
                            <p className="text-red-600 text-sm">{result.error}</p>
                          </div>
                        ) : (
                          <div className="max-h-32 overflow-y-auto">
                            <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                              {JSON.stringify(result.response, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 text-sm">
              ✓ Text extracted successfully from {results.pdf_results.filter(pdf => pdf.success).length} file{results.pdf_results.filter(pdf => pdf.success).length !== 1 ? 's' : ''}! 
              You can now proceed to the next step to extract meeting attendees.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}