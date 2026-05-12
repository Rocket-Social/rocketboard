import * as DialogPrimitive from '@radix-ui/react-dialog'
import {X} from 'lucide-react'
import {forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes} from 'react'

import {cn} from '../../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({className, ...props}, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-slate-950/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({className, children, showCloseButton = true, ...props}, ref) => (
    <DialogPortal>
      <DialogOverlay/>
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-[60] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-subtle bg-surface-elevated shadow-float data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label='Close'
            className='absolute right-4 top-4 rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          >
            <X className='h-4 w-4'/>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
)
DialogContent.displayName = 'DialogContent'

export const DialogHeader = ({className, ...props}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 border-b border-border-subtle px-6 py-5 pr-14', className)} {...props}/>
)
DialogHeader.displayName = 'DialogHeader'

export const DialogFooter = ({className, ...props}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex justify-end gap-3 border-t border-border-subtle px-6 py-4', className)} {...props}/>
)
DialogFooter.displayName = 'DialogFooter'

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({className, ...props}, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-lg font-semibold text-text-strong', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({className, ...props}, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-text-medium', className)} {...props}/>
))
DialogDescription.displayName = 'DialogDescription'

export const DialogBody = ({className, ...props}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-4 px-6 py-5', className)} {...props}/>
)
DialogBody.displayName = 'DialogBody'
