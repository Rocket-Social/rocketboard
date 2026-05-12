import {ArrowDown, ArrowUp, ChevronDown, ChevronUp} from 'lucide-react'
import {memo, useState} from 'react'

type SortDirection = 'asc' | 'desc' | 'none'

type ColumnSortIconProps = {
  ascendingLabel?: string
  descendingLabel?: string
  direction: SortDirection
  onClear: () => void
  onSave: () => void
  onToggle: () => void
  reverseActiveDirectionIcon?: boolean
}

export const ColumnSortIcon = memo(function ColumnSortIcon({
  ascendingLabel = 'Ascending',
  descendingLabel = 'Descending',
  direction,
  onClear,
  onSave,
  onToggle,
  reverseActiveDirectionIcon = false,
}: ColumnSortIconProps) {
  const [isButtonHovered, setIsButtonHovered] = useState(false)
  const [isIconHovered, setIsIconHovered] = useState(false)
  const [isClearHovered, setIsClearHovered] = useState(false)
  const [isSaveHovered, setIsSaveHovered] = useState(false)
  const [isGroupHovered, setIsGroupHovered] = useState(false)

  const isActive = direction !== 'none'

  if (isActive) {
    return (
      <div
        className='flex items-center gap-1'
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={() => setIsGroupHovered(true)}
        onMouseLeave={() => setIsGroupHovered(false)}
      >
        {/* Clear button — visible on hover, white bg, blue on direct hover */}
        <button
          className={`rounded-full px-2 py-0.5 text-[10px] transition-all duration-150 ${
            isGroupHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
          } ${
            isClearHovered
              ? 'bg-primary text-white'
              : 'border border-border-strong bg-white text-text-muted'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
          onMouseEnter={() => setIsClearHovered(true)}
          onMouseLeave={() => setIsClearHovered(false)}
          type='button'
        >
          clear
        </button>

        {/* Sort icon — always blue when active */}
        <div
          className='relative'
          onMouseEnter={() => setIsIconHovered(true)}
          onMouseLeave={() => setIsIconHovered(false)}
        >
          <button
            className='flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-primary transition-colors hover:bg-primary/80'
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            type='button'
          >
            {direction === 'asc'
              ? reverseActiveDirectionIcon
                ? <ArrowDown className='h-3 w-3 text-white'/>
                : <ArrowUp className='h-3 w-3 text-white'/>
              : reverseActiveDirectionIcon
                ? <ArrowUp className='h-3 w-3 text-white'/>
                : <ArrowDown className='h-3 w-3 text-white'/>}
          </button>
          {/* Tooltip below icon */}
          <div
            className={`pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-3 py-1.5 text-[13px] text-white transition-opacity duration-150 ${
              isIconHovered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {direction === 'asc' ? ascendingLabel : descendingLabel}
          </div>
        </div>

        {/* Save button — visible on hover, white bg, blue on direct hover */}
        <button
          className={`rounded-full px-2 py-0.5 text-[10px] transition-all duration-150 ${
            isGroupHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
          } ${
            isSaveHovered
              ? 'bg-primary text-white'
              : 'border border-border-strong bg-white text-text-muted'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            onSave()
          }}
          onMouseEnter={() => setIsSaveHovered(true)}
          onMouseLeave={() => setIsSaveHovered(false)}
          type='button'
        >
          save
        </button>
      </div>
    )
  }

  // Inactive state — show up/down chevrons, turns blue on direct hover
  return (
    <div
      className='relative'
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={() => setIsButtonHovered(true)}
      onMouseLeave={() => setIsButtonHovered(false)}
    >
      <button
        className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-all duration-150 ${
          isButtonHovered
            ? 'bg-primary'
            : 'border border-border-strong bg-white'
        }`}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        type='button'
      >
        <div className='-space-y-1 flex flex-col items-center justify-center'>
          <ChevronUp className={`h-2.5 w-2.5 ${isButtonHovered ? 'text-white' : 'text-text-muted'}`}/>
          <ChevronDown className={`h-2.5 w-2.5 ${isButtonHovered ? 'text-white' : 'text-text-muted'}`}/>
        </div>
      </button>
      {/* Tooltip below icon — shows "Sort" */}
      <div
        className={`pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-3 py-1.5 text-[13px] text-white transition-opacity duration-150 ${
          isButtonHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Sort
      </div>
    </div>
  )
})
