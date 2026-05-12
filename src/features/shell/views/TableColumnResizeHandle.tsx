import {memo, useCallback, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

type TableColumnResizeHandleProps = {
  columnKey: string
  onResizeStart: (columnKey: string, event: React.MouseEvent) => void
}

export const TableColumnResizeHandle = memo(function TableColumnResizeHandle({
  columnKey,
  onResizeStart,
}: TableColumnResizeHandleProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{x: number; y: number} | null>(null)
  const gripRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    if (gripRef.current) {
      const rect = gripRef.current.getBoundingClientRect()
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      })
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    setTooltipPos(null)
  }, [])

  return (
    <div
      ref={gripRef}
      className='absolute right-0 top-0 z-10 flex h-full w-4 cursor-col-resize justify-end'
      onMouseDown={(event) => onResizeStart(columnKey, event)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isHovered && tooltipPos
        ? createPortal(
          <div
            className='pointer-events-none fixed z-[9999] whitespace-nowrap rounded bg-gray-800 px-3 py-1.5 text-[13px] text-white'
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: 'translate(-50%, -100%) translateY(-8px)',
            }}
          >
            Resize column
            <div className='absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-800'/>
          </div>,
          document.body,
        )
        : null}
      <div
        className={`mr-0 h-full w-[2px] transition-colors duration-150 ${
          isHovered ? 'bg-primary' : 'bg-transparent'
        }`}
      />
    </div>
  )
})
