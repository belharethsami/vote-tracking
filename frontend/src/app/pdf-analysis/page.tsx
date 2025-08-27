'use client'

import { RubricEntrySection } from '../components/RubricEntrySection'
import { PdfUploadSection } from '../components/PdfUploadSection'
import { OcrProcessingSection } from '../components/OcrProcessingSection'

export default function PdfAnalysisPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          PDF Vote Analysis System
        </h1>
        <p className="text-lg text-gray-600">
          Upload PDF files and extract text using OCR processing.
        </p>
      </div>

      <RubricEntrySection />
      <PdfUploadSection />
      <OcrProcessingSection />
    </div>
  )
}