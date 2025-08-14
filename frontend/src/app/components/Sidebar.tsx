'use client'

import { useApp } from './AppContext'

interface FlowchartStepProps {
  stepNumber: number
  title: string
  isActive: boolean
  isCompleted: boolean
  isLast?: boolean
}

function FlowchartStep({ stepNumber, title, isActive, isCompleted, isLast = false }: FlowchartStepProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Step Circle */}
      <div className={`
        w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold
        ${isActive 
          ? 'bg-blue-600 text-white shadow-lg' 
          : isCompleted 
            ? 'bg-green-500 text-white' 
            : 'bg-gray-200 text-gray-600'
        }
      `}>
        {isCompleted ? '✓' : stepNumber}
      </div>
      
      {/* Step Title */}
      <div className={`
        mt-2 text-sm font-medium text-center max-w-24
        ${isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-600'}
      `}>
        {title}
      </div>
      
      {/* Connecting Line */}
      {!isLast && (
        <div className={`
          w-1 h-8 mt-2
          ${isCompleted ? 'bg-green-300' : 'bg-gray-300'}
        `} />
      )}
    </div>
  )
}

export function Sidebar() {
  const { state } = useApp()
  
  const steps = [
    {
      number: 1,
      title: 'PDF OCR',
      isCompleted: state.step1Data.ocrResults.length > 0,
      isActive: state.currentStep === 1
    },
    {
      number: 2,
      title: 'Extract Meeting Attendees',
      isCompleted: state.step2Data.attendeeResults !== null,
      isActive: state.currentStep === 2
    },
    {
      number: 3,
      title: 'Extract Vote Patterns',
      isCompleted: state.step3Data.voteResults !== null,
      isActive: state.currentStep === 3
    }
  ]

  return (
    <div className="w-40 bg-white border-r border-gray-200 p-6 flex flex-col items-center">
      <h2 className="text-lg font-semibold text-gray-800 mb-8 text-center">
        Workflow
      </h2>
      
      <div className="flex flex-col space-y-0">
        {steps.map((step, index) => (
          <FlowchartStep
            key={step.number}
            stepNumber={step.number}
            title={step.title}
            isActive={step.isActive}
            isCompleted={step.isCompleted}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  )
}