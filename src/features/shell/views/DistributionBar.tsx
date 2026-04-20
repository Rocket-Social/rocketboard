import {useRef, useState} from 'react'
import {createPortal} from 'react-dom'

export type DistributionSegment = {
  color: string
  count: number
  key: string
  label: string
}

type DistributionBarProps = {
  segments: DistributionSegment[]
  total: number
}

export function DistributionBar({segments, total}: DistributionBarProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [tooltip, setTooltip] = useState<{left: number; title: string; top: number} | null>(null)

  if (total === 0) {
    return <div className='h-5 w-full rounded-[3px] bg-border-subtle/30'/>
  }

  return (
    <div className='flex h-5 w-full overflow-hidden rounded-[3px] bg-border-subtle/30'>
      {segments.map((segment) => {
        const percent = (segment.count / total) * 100
        const hasCount = segment.count > 0

        return (
          <div
            className={hasCount ? 'min-w-[3px]' : 'min-w-[2px]'}
            key={segment.key}
            onMouseEnter={(event) => {
              anchorRef.current = event.currentTarget
              const rect = event.currentTarget.getBoundingClientRect()
              setTooltip({
                left: rect.left + rect.width / 2,
                title: `${segment.label} ${segment.count}/${total} ${percent.toFixed(1)}%`,
                top: rect.top,
              })
            }}
            onMouseLeave={() => {
              anchorRef.current = null
              setTooltip(null)
            }}
            style={{width: hasCount ? `${percent}%` : undefined}}
          >
            <div
              className='h-full w-full'
              style={{backgroundColor: segment.color, opacity: hasCount ? 1 : 0.3}}
            />
          </div>
        )
      })}

      {tooltip
        ? createPortal(
          <div
            className='pointer-events-none fixed z-[9999]'
            style={{left: tooltip.left, top: tooltip.top, transform: 'translate(-50%, -100%) translateY(-8px)'}}
          >
            <div className='relative whitespace-nowrap rounded bg-gray-800 px-3 py-1.5 text-[13px] text-white shadow-sm'>
              {tooltip.title}
              <div className='absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-gray-800'/>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
