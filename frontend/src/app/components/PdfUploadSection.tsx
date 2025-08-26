'use client'

import { useState } from 'react'
import { useApp } from './AppContext'

export function PdfUploadSection() {
  const { 
    state, 
    setApiKey, 
    setFiles, 
    setResults,
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

  const handleClear = () => {
    setSelectedFiles([])
    clearData()
    setError('')
    setCurrentStep(1)
  }

  return (
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
  )
}