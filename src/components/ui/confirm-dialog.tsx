import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

import {cn} from '../../lib/cn'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className='fixed inset-0 z-50 bg-slate-950/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'/>
        <AlertDialogPrimitive.Content className='fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-surface-elevated p-6 shadow-md'>
          <AlertDialogPrimitive.Title className='text-base font-semibold text-text-strong'>
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className='mt-2 text-sm leading-relaxed text-text-medium'>
              {description}
            </AlertDialogPrimitive.Description>
          ) : (
            <AlertDialogPrimitive.Description className='sr-only'>
              Confirm or cancel this action.
            </AlertDialogPrimitive.Description>
          )}
          <div className='mt-6 flex justify-end gap-3'>
            <AlertDialogPrimitive.Cancel
              className='inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 text-sm font-medium text-text-medium transition-colors hover:bg-surface-base hover:text-text-strong'
              onClick={onCancel}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={cn(
                'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white transition-colors',
                variant === 'destructive'
                  ? 'bg-error hover:brightness-110'
                  : 'bg-primary hover:brightness-110',
              )}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

type PromptDialogProps = {
  open: boolean
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  open,
  title,
  description,
  defaultValue = '',
  placeholder,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className='fixed inset-0 z-50 bg-slate-950/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'/>
        <AlertDialogPrimitive.Content
          className='fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-surface-elevated p-6 shadow-md'
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <AlertDialogPrimitive.Title className='text-base font-semibold text-text-strong'>
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className='mt-2 text-sm leading-relaxed text-text-medium'>
              {description}
            </AlertDialogPrimitive.Description>
          ) : (
            <AlertDialogPrimitive.Description className='sr-only'>
              Enter a value and confirm to continue.
            </AlertDialogPrimitive.Description>
          )}
          <form
            className='mt-4'
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const value = (formData.get('prompt-value') as string).trim()
              if (value) onConfirm(value)
            }}
          >
            <input
              autoFocus
              className='w-full rounded-lg border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-strong outline-none ring-primary focus:ring-2'
              defaultValue={defaultValue}
              name='prompt-value'
              placeholder={placeholder}
            />
            <div className='mt-6 flex justify-end gap-3'>
              <AlertDialogPrimitive.Cancel
                className='inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 text-sm font-medium text-text-medium transition-colors hover:bg-surface-base hover:text-text-strong'
                onClick={onCancel}
              >
                {cancelLabel}
              </AlertDialogPrimitive.Cancel>
              <button
                className='inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110'
                type='submit'
              >
                {confirmLabel}
              </button>
            </div>
          </form>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
