import {memo, useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

export type CalculationConfig = {
  calculation: 'none' | 'sum' | 'average' | 'median' | 'min' | 'max' | 'count'
  unit?: string
  unitPosition?: 'left' | 'right'
}

type NumericCalculationPopupProps = {
  config: CalculationConfig
  onClose: () => void
  onConfigChange: (config: CalculationConfig) => void
  overallValue?: string
  position: {x: number; y: number}
}

const UNIT_OPTIONS = ['None', '$', '€', '£', '%'] as const
const CALC_OPTIONS = ['None', 'Sum', 'Average', 'Median', 'Min', 'Max', 'Count'] as const

const pillBase = 'px-2 py-0.5 border rounded-sm text-[12px]'
const pillSelected = 'border-primary text-primary bg-primary-soft'
const pillDefault = 'border-border-strong text-text-medium hover:bg-canvas-accent'

export const NumericCalculationPopup = memo(function NumericCalculationPopup({
  config,
  onClose,
  onConfigChange,
  overallValue,
  position,
}: NumericCalculationPopupProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [customUnit, setCustomUnit] = useState(
    config.unit && !['$', '€', '£', '%'].includes(config.unit) ? config.unit : '',
  )

  void (config.unit ?? 'None')
  const currentCalc = config.calculation
  const unitPosition = config.unitPosition ?? 'left'
  const supportsUnits = currentCalc !== 'none'

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    const tid = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)

    return () => {
      clearTimeout(tid)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleUnitChange = (nextUnit: string) => {
    onConfigChange({...config, unit: nextUnit === 'None' || nextUnit === '' ? undefined : nextUnit})
  }

  const handleCalcChange = (nextCalc: string) => {
    const calc = nextCalc.toLowerCase() as CalculationConfig['calculation']
    onConfigChange({...config, calculation: calc})
  }

  const handlePositionChange = (pos: 'left' | 'right') => {
    onConfigChange({...config, unitPosition: pos})
  }

  const calcLabel = currentCalc === 'none' ? 'None' : currentCalc.charAt(0).toUpperCase() + currentCalc.slice(1)

  return createPortal(
    <div
      className='fixed z-50'
      ref={menuRef}
      style={{left: position.x, top: position.y, transform: 'translateY(-100%) translateY(-8px)'}}
    >
      <div className='min-w-[280px] rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-elevated'>
        {supportsUnits ? (
          <div className='mb-3'>
            <div className='mb-1.5 text-[12px] font-medium text-text-strong'>Unit</div>
            <div className='flex flex-wrap items-center gap-1'>
              {UNIT_OPTIONS.map((opt) => {
                const isSelected = (opt === 'None' && !config.unit) || config.unit === opt
                return (
                  <button
                    className={`${pillBase} ${isSelected ? pillSelected : pillDefault}`}
                    key={opt}
                    onClick={() => handleUnitChange(opt === 'None' ? '' : opt)}
                    type='button'
                  >
                    {opt}
                  </button>
                )
              })}
              <input
                className='h-6 w-[110px] rounded-sm border border-border-strong bg-transparent px-2 text-[12px] text-text-medium outline-none focus:border-primary'
                onBlur={() => handleUnitChange(customUnit)}
                onChange={(e) => setCustomUnit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnitChange(customUnit)
                }}
                placeholder='Type your own'
                value={customUnit}
              />
              <div className='ml-2 inline-flex items-center gap-1'>
                <button
                  className={`flex h-6 w-6 items-center justify-center rounded-sm border text-[12px] ${unitPosition === 'left' ? pillSelected : pillDefault}`}
                  onClick={() => handlePositionChange('left')}
                  type='button'
                >
                  L
                </button>
                <button
                  className={`flex h-6 w-6 items-center justify-center rounded-sm border text-[12px] ${unitPosition === 'right' ? pillSelected : pillDefault}`}
                  onClick={() => handlePositionChange('right')}
                  type='button'
                >
                  R
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <div className='mb-1.5 text-[12px] font-medium text-text-strong'>Calculation</div>
          <div className='flex flex-wrap items-center gap-1'>
            {CALC_OPTIONS.map((opt) => {
              const isSelected = calcLabel === opt
              return (
                <button
                  className={`${pillBase} ${isSelected ? pillSelected : pillDefault}`}
                  key={opt}
                  onClick={() => handleCalcChange(opt)}
                  type='button'
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>

        {supportsUnits && overallValue ? (
          <div className='mt-3 border-t border-border-subtle pt-2 text-[12px] text-text-muted'>
            Overall {calcLabel.toLowerCase()} of column: {overallValue}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
})
