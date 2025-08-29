'use client'

import { useState } from 'react'
import { useApp } from './AppContext'

export function OcrProcessingSection() {
  const { 
    state, 
    setResults, 
    setStepStatus
  } = useApp()
  
  const [error, setError] = useState('')

  const handleStep1Process = async () => {
    if (!state.apiKey) {
      setError('Please enter your API key')
      return
    }
    
    if (state.files.length === 0) {
      setError('Please select at least one PDF file')
      return
    }

    setStepStatus(1, 'processing')
    setError('')
    
    try {
      const formData = new FormData()
      state.files.forEach(file => {
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
      
      // Update results with text extraction data
      const updates = data.results.map((result: unknown) => {
        const typedResult = result as {
          filename: string
          success: boolean
          total_pages?: number
          extraction_method?: 'direct' | 'ocr'
          ocr_results?: unknown
          extracted_text?: string
          error?: string
        }
        return {
          ...typedResult,
          totalPages: typedResult.total_pages,
          extractionMethod: typedResult.extraction_method,
          ocrResults: typedResult.ocr_results,
          extractedText: typedResult.extracted_text
        }
      })
      
      setResults(updates)
      setStepStatus(1, 'complete')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStepStatus(1, 'error')
    }
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

  return (
    <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Step 1: Text Extraction</h2>
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
        disabled={state.step1Status === 'processing' || !state.apiKey || state.files.length === 0}
        className="mb-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {state.step1Status === 'processing' ? 'Extracting Text...' : `Extract Text from ${state.files.length} PDF(s)`}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {state.results.length > 0 && (
        <div className="space-y-4">
          {state.results.map((result, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{result.filename}</h3>
                {result.success ? (
                  <div className="flex space-x-2">
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                      Success ({result.totalPages} pages)
                    </span>
                    {result.extractionMethod && (
                      <span className={`px-2 py-1 rounded text-sm ${
                        result.extractionMethod === 'direct' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {result.extractionMethod === 'direct' ? 'Direct' : 'OCR'}
                      </span>
                    )}
                  </div>
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
                    placeholder="Extracted text will appear here..."
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
  )
}