import {Loader2, Paintbrush} from 'lucide-react'
import type {DragEvent, PointerEventHandler, ReactNode, RefObject, WheelEventHandler} from 'react'

import {cn} from '../../lib/cn'
import type {CanvasViewport} from './canvas.types'

type CanvasSurfaceProps = {
  canEdit: boolean
  children: ReactNode
  empty: boolean
  errorMessage?: string | null
  isDragActive: boolean
  isLoading: boolean
  onDragEnter?: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void
  onDropFiles?: (event: DragEvent<HTMLDivElement>) => void
  onPointerCancel: PointerEventHandler<HTMLDivElement>
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onRetry?: () => void
  onWheel: WheelEventHandler<HTMLDivElement>
  surfaceRef: RefObject<HTMLDivElement | null>
  viewport: CanvasViewport
}

function buildGridBackground(viewport: CanvasViewport) {
  const size = 20 * viewport.scale
  const x = viewport.x
  const y = viewport.y

  return {
    backgroundImage: 'radial-gradient(circle, rgba(217, 209, 197, 0.85) 1px, transparent 1.5px)',
    backgroundPosition: `${x}px ${y}px`,
    backgroundSize: `${size}px ${size}px`,
  }
}

export function CanvasSurface({
  canEdit,
  children,
  empty,
  errorMessage,
  isDragActive,
  isLoading,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDropFiles,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onRetry,
  onWheel,
  surfaceRef,
  viewport,
}: CanvasSurfaceProps) {
  return (
    <div
      className='relative h-full min-h-[520px] w-full overflow-hidden bg-canvas'
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDropFiles}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      ref={surfaceRef}
      role='application'
      style={buildGridBackground(viewport)}
      tabIndex={0}
    >
      <div
        className='absolute inset-0 transform-gpu'
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <div className='relative h-full w-full overflow-visible'>
          {children}
        </div>
      </div>

      {isLoading ? (
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/80'>
          <div className='flex items-center gap-3 rounded-2xl bg-surface-elevated px-4 py-3 text-sm text-text-medium shadow-panel'>
            <Loader2 className='h-4 w-4 animate-spin'/>
            Loading canvas
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='rounded-3xl border border-border-subtle bg-surface-elevated px-6 py-5 text-center shadow-panel'>
            <h2 className='font-display text-lg font-semibold text-text-strong'>Couldn&apos;t load canvas</h2>
            <p className='mt-2 max-w-sm text-sm text-text-medium'>{errorMessage}</p>
            {onRetry ? (
              <button
                className='mt-4 rounded-xl bg-sidebar px-4 py-2 text-sm font-medium text-text-inverse'
                onClick={onRetry}
                type='button'
              >
                Retry
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isLoading && !errorMessage && empty ? (
        <div className='pointer-events-none absolute left-[12%] top-[26%] max-w-sm'>
          <div className='rounded-3xl border border-border-subtle/80 bg-surface-elevated/80 px-5 py-4 shadow-panel backdrop-blur-sm'>
            <Paintbrush className='h-10 w-10 text-text-muted'/>
            <h2 className='mt-3 font-display text-lg font-semibold text-text-strong'>Map your thinking</h2>
            <p className='mt-2 text-sm leading-relaxed text-text-muted'>
              {canEdit
                ? 'Add notes, drop images, or sketch with the tools below.'
                : 'This canvas doesn’t have any elements yet.'}
            </p>
          </div>
        </div>
      ) : null}

      {isDragActive ? (
        <div className={cn(
          'pointer-events-none absolute inset-4 rounded-[24px] border-2 border-dashed border-primary bg-primary-soft/20 transition-opacity',
        )}/>
      ) : null}
    </div>
  )
}
