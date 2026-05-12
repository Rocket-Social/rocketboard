import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {cn} from '../../lib/cn'
import {X} from 'lucide-react'

/* ─── Types ───────────────────────────────────────────────────── */

interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'error' | 'info'
  action?: {label: string; onClick: () => void}
  duration?: number
}

interface ToastContextValue {
  toast: (options: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
}

/* ─── Context ─────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/* ─── Provider ────────────────────────────────────────────────── */

const TOAST_DURATION = 5000
const ANIMATION_DURATION = 180

export function ToastProvider({children}: {children: ReactNode}) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [exiting, setExiting] = useState(false)

  const dismiss = useCallback((id: string) => {
    setCurrent(prev => {
      if (prev?.id !== id) return prev
      setExiting(true)
      setTimeout(() => {
        setCurrent(c => (c?.id === id ? null : c))
        setExiting(false)
      }, ANIMATION_DURATION)
      return prev
    })
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const toast = useCallback((options: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setExiting(false)
    setCurrent({id, ...options})
    const duration = options.duration ?? TOAST_DURATION
    timeoutRef.current = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <ToastContext.Provider value={{toast, dismiss}}>
      {children}
      {current && createPortal(
        <ToastItem toast={current} exiting={exiting} onDismiss={() => dismiss(current.id)}/>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/* ─── Toast Item ──────────────────────────────────────────────── */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function ToastItem({toast, exiting, onDismiss}: {toast: Toast; exiting: boolean; onDismiss: () => void}) {
  const animate = !prefersReducedMotion()

  return (
    <div
      role='status'
      aria-live='polite'
      className={cn(
        'fixed bottom-6 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 shadow-panel',
        toast.variant === 'error'
          ? 'bg-error text-white'
          : 'bg-sidebar text-text-inverse',
        animate && !exiting && 'animate-toast-enter',
        animate && exiting && 'animate-toast-exit',
        !animate && exiting && 'opacity-0',
      )}
    >
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>{toast.title}</p>
        {toast.description && (
          <p className={cn(
            'mt-0.5 text-xs',
            toast.variant === 'error' ? 'text-white/80' : 'text-text-inverse-muted',
          )}>
            {toast.description}
          </p>
        )}
      </div>

      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick()
            onDismiss()
          }}
          className={cn(
            'shrink-0 text-sm font-medium underline underline-offset-2 transition-opacity hover:opacity-80',
            toast.variant === 'error' ? 'text-white' : 'text-text-inverse',
          )}
        >
          {toast.action.label}
        </button>
      )}

      <button
        onClick={onDismiss}
        className={cn(
          'shrink-0 rounded-lg p-1 transition-opacity hover:opacity-80',
          toast.variant === 'error' ? 'text-white/80' : 'text-text-inverse-muted',
        )}
        aria-label='Dismiss'
      >
        <X size={14}/>
      </button>
    </div>
  )
}
