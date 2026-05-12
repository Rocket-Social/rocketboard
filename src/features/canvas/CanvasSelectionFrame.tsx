import type {PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import type {CanvasResizeHandle} from './canvas.types'

const selectionHandlePositions = [
  {
    className: 'left-1/2 top-0 h-4 w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
    key: 'top' satisfies CanvasResizeHandle,
    label: 'Resize from top',
    visible: false,
  },
  {
    className: 'right-0 top-1/2 h-[calc(100%-24px)] w-4 -translate-y-1/2 translate-x-1/2 cursor-ew-resize',
    key: 'right' satisfies CanvasResizeHandle,
    label: 'Resize from right',
    visible: false,
  },
  {
    className: 'bottom-0 left-1/2 h-4 w-[calc(100%-24px)] -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
    key: 'bottom' satisfies CanvasResizeHandle,
    label: 'Resize from bottom',
    visible: false,
  },
  {
    className: 'left-0 top-1/2 h-[calc(100%-24px)] w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
    key: 'left' satisfies CanvasResizeHandle,
    label: 'Resize from left',
    visible: false,
  },
  {
    className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
    key: 'top-left' satisfies CanvasResizeHandle,
    label: 'Resize from top left',
    visible: true,
  },
  {
    className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
    key: 'top-right' satisfies CanvasResizeHandle,
    label: 'Resize from top right',
    visible: true,
  },
  {
    className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
    key: 'bottom-left' satisfies CanvasResizeHandle,
    label: 'Resize from bottom left',
    visible: true,
  },
  {
    className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
    key: 'bottom-right' satisfies CanvasResizeHandle,
    label: 'Resize from bottom right',
    visible: true,
  },
] as const

type CanvasSelectionFrameProps = {
  height: number
  onHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, handle: CanvasResizeHandle) => void
  showCornerMarkers?: boolean
  showHandles?: boolean
  testId?: string
  variant?: 'element' | 'group'
  width: number
  x: number
  y: number
  zIndex: number
}

const elementFrameShadow = '0 0 0 1px var(--color-canvas-selection-contrast), 0 0 0 2px var(--color-canvas-selection-soft)'
const groupFrameShadow = '0 0 0 1px var(--color-canvas-selection-contrast), 0 0 0 4px var(--color-canvas-selection-soft)'

export function CanvasSelectionFrame({
  height,
  onHandlePointerDown,
  showCornerMarkers = false,
  showHandles = false,
  testId = 'canvas-selection-frame',
  variant = 'element',
  width,
  x,
  y,
  zIndex,
}: CanvasSelectionFrameProps) {
  const shouldShowPassiveCornerMarkers = showCornerMarkers && !showHandles
  const frameShadow = variant === 'group' ? groupFrameShadow : elementFrameShadow

  return (
    <div
      className='pointer-events-none absolute'
      data-testid={testId}
      style={{
        height: `${height}px`,
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        zIndex,
      }}
      {...(!showHandles ? {'aria-hidden': true} : {})}
    >
      <div
        className='absolute inset-0 rounded-[12px] border-2'
        style={{
          borderColor: 'var(--color-canvas-selection)',
          boxShadow: frameShadow,
        }}
      />

      {showHandles ? selectionHandlePositions.map((handle) => (
        <button
          aria-label={handle.label}
          className={cn(
            'pointer-events-auto absolute touch-none',
            handle.visible
              ? 'h-3 w-3 rounded-[4px] border-2 bg-surface-elevated shadow-sm'
              : 'rounded-none border-0 bg-transparent',
            handle.className,
          )}
          data-testid={`canvas-selection-handle-${handle.key}`}
          key={handle.key}
          onPointerDown={(event) => {
            event.stopPropagation()
            onHandlePointerDown?.(event, handle.key)
          }}
          style={handle.visible ? {borderColor: 'var(--color-canvas-selection)'} : undefined}
          type='button'
        />
      )) : null}

      {shouldShowPassiveCornerMarkers ? selectionHandlePositions.filter((handle) => handle.visible).map((handle) => (
        <div
          aria-hidden
          className={cn(
            'absolute h-3.5 w-3.5 rounded-[4px] border-2 bg-surface-elevated shadow-sm',
            handle.className,
          )}
          data-testid={`canvas-selection-corner-${handle.key}`}
          key={handle.key}
          style={{borderColor: 'var(--color-canvas-selection)'}}
        />
      )) : null}
    </div>
  )
}
