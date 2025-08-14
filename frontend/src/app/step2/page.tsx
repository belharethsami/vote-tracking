'use client'

import { useState, useEffect } from 'react'
import { useApp } from '../components/AppContext'

export default function Step2() {
  const { state, setStep2Data } = useApp()
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState('')

  // Prepopulate input text from Step 1 results
  useEffect(() => {
    if (state.step1Data.ocrResults && !inputText) {
      setInputText(state.step1Data.ocrResults)
      setStep2Data({ inputText: state.step1Data.ocrResults })
    }
  }, [state.step1Data.ocrResults, inputText, setStep2Data])

  // Load previous results if available
  useEffect(() => {
    if (state.step2Data.attendeeResults) {
      setResults(state.step2Data.attendeeResults)
    }
    if (state.step2Data.inputText) {
      setInputText(state.step2Data.inputText)
    }
  }, [state.step2Data])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setInputText(text)
    setStep2Data({ inputText: text })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!state.apiKey) {
      setError('Please enter your API key in Step 1')
      return
    }
    
    if (!inputText.trim()) {
      setError('Please enter text to analyze')
      return
    }

    setLoading(true)
    setError('')
    setResults(null)

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/extract-attendees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText,
          api_key: state.apiKey
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to extract attendees')
      }

      const data = await response.json()
      setResults(data)
      setStep2Data({ attendeeResults: data })
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
          Extract Meeting Attendees
        </h1>
        <p className="text-lg text-gray-600">
          Identify city council members who attended the meeting
        </p>
      </div>

      <div className="bg-white shadow-lg rounded-lg p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="inputText" className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Text
            </label>
            <textarea
              id="inputText"
              value={inputText}
              onChange={handleInputChange}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
              placeholder="Paste or edit the meeting text here..."
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Text from Step 1 is automatically populated here. You can edit it if needed.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !state.apiKey || !inputText.trim()}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Extracting Attendees...' : 'Extract Attendees'}
          </button>
        </form>
      </div>

      {loading && (
        <div className="mt-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Analyzing meeting text...</p>
        </div>
      )}

      {results && (
        <div className="mt-8 bg-white shadow-lg rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Extracted Attendees
          </h2>
          
          <div className="bg-gray-50 rounded-md p-4">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
          
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 text-sm">
              ✓ Meeting attendees extracted successfully! You can now proceed to the next step to extract vote patterns.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}