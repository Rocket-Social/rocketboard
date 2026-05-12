import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from 'react'
import {createPortal} from 'react-dom'

// ─── Portal-based toolbar slots ──────────────────────────────────────────────
//
// View routes render toolbar content declaratively via <ToolbarPortal>. The
// content is teleported into portal targets rendered by <ToolbarArea>. This
// avoids the useEffect + parent-state-setter pattern which caused infinite
// re-render loops (React error #185) when toolbar content referenced values
// that changed during the same render cycle (e.g. URL search params).
//
// Data flow:
//   ToolbarArea renders <div ref={leadingRef}> and <div ref={trailingRef}>
//   ToolbarPortalProvider shares those refs via context
//   ViewRoute renders <ToolbarPortal slot="leading">...JSX...</ToolbarPortal>
//   ToolbarPortal uses createPortal to render JSX into the target div
//
// No effects. No state setters. No re-render cascades.

export type ToolbarSlotName = 'leading' | 'trailing' | 'view-tabs-trailing'

type ToolbarPortalContextValue = {
  leadingRef: React.RefObject<HTMLDivElement | null>
  trailingRef: React.RefObject<HTMLDivElement | null>
  viewTabsTrailingRef: React.RefObject<HTMLDivElement | null>
  /** Increment to force children to re-check refs after mount */
  mountTick: number
}

const ToolbarPortalContext = createContext<ToolbarPortalContextValue | null>(null)

export function ToolbarPortalProvider({children}: {children: ReactNode}) {
  const leadingRef = useRef<HTMLDivElement | null>(null)
  const trailingRef = useRef<HTMLDivElement | null>(null)
  const viewTabsTrailingRef = useRef<HTMLDivElement | null>(null)
  // Tick increments once after initial mount so portal children re-render
  // and can find their now-mounted target refs.
  const [mountTick, setMountTick] = useState(0)
  useEffect(() => { setMountTick(1) }, [])

  return (
    <ToolbarPortalContext.Provider value={{leadingRef, trailingRef, viewTabsTrailingRef, mountTick}}>
      {children}
    </ToolbarPortalContext.Provider>
  )
}

function getTargetRef(ctx: ToolbarPortalContextValue, slot: ToolbarSlotName) {
  if (slot === 'leading') {
    return ctx.leadingRef
  }

  if (slot === 'trailing') {
    return ctx.trailingRef
  }

  return ctx.viewTabsTrailingRef
}

/**
 * Render the toolbar area with portal targets. Must be inside ToolbarPortalProvider.
 * Call notifyTargetsReady() after this component mounts so portals can find their targets.
 */
export function ToolbarArea({onReady}: {onReady?: () => void}) {
  const ctx = useContext(ToolbarPortalContext)
  if (!ctx) throw new Error('ToolbarArea must be inside ToolbarPortalProvider')

  // Notify provider that targets are mounted (once)
  const notifiedRef = useRef(false)
  if (!notifiedRef.current && onReady) {
    // Schedule after paint so refs are populated
    queueMicrotask(() => {
      if (!notifiedRef.current) {
        notifiedRef.current = true
        onReady()
      }
    })
  }

  return (
    // `flex-wrap` lets trailing content flow to a second line when a view's
    // toolbar is wider than the viewport (e.g. Gantt: leading filters + trailing
    // date picker + time-scale toggle). Previously these overflowed the page,
    // clipping the date picker off-screen on narrower laptops.
    <div className='flex shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-base px-4 py-3 sm:px-6'>
      <div ref={ctx.leadingRef} className='contents'/>
      <div className='ml-auto flex flex-wrap items-center gap-3'>
        <div ref={ctx.trailingRef} className='contents'/>
      </div>
    </div>
  )
}

export function ToolbarTarget({className, slot}: {className?: string; slot: ToolbarSlotName}) {
  const ctx = useContext(ToolbarPortalContext)
  if (!ctx) return null

  return <div ref={getTargetRef(ctx, slot)} className={className}/>
}

/**
 * Portal component for rendering toolbar content from view routes.
 * Content is rendered via createPortal into the target ref in ToolbarArea.
 *
 * Usage:
 *   <ToolbarPortal slot="leading">
 *     <Button>Add task</Button>
 *   </ToolbarPortal>
 */
export function ToolbarPortal({slot, children}: {slot: ToolbarSlotName; children: ReactNode}) {
  const ctx = useContext(ToolbarPortalContext)
  if (!ctx) return null

  const target = getTargetRef(ctx, slot).current
  if (!target) return null

  return createPortal(children, target)
}

/**
 * Hook to trigger a re-render when toolbar targets become available.
 * Call this in view routes that render ToolbarPortal.
 */
export function useToolbarReady() {
  const ctx = useContext(ToolbarPortalContext)
  return ctx?.mountTick ?? 0
}
