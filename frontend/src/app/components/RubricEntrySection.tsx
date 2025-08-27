'use client'

import { useApp } from './AppContext'

export function RubricEntrySection() {
  const { 
    state, 
    setRubric
  } = useApp()

  const handleRubricChange = (value: string) => {
    setRubric(value)
  }

  const handleClearRubric = () => {
    setRubric('')
  }

  const characterCount = state.rubric.length

  return (
    <div className="bg-white shadow-lg rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Step 0: Enter Rubric</h2>
        <div className="flex items-center space-x-2">
          {state.step0Status === 'complete' && (
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
              Complete
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="rubric" className="block text-sm font-medium text-gray-700 mb-2">
            Rubric / Instructions (Optional)
          </label>
          <textarea
            id="rubric"
            value={state.rubric}
            onChange={(e) => handleRubricChange(e.target.value)}
            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black resize-none"
            placeholder="Enter any specific instructions, criteria, or rubric for processing the documents..."
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-gray-500">
              Character count: {characterCount.toLocaleString()}
            </p>
            {state.rubric && (
              <button
                onClick={handleClearRubric}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                Clear Rubric
              </button>
            )}
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
          <p className="text-sm text-purple-700">
            <strong>Optional:</strong> Add any specific instructions or criteria that should guide the document processing. 
            This rubric will be used to customize the analysis approach for your documents.
          </p>
        </div>
      </div>
    </div>
  )
}