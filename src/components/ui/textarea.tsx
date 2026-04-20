import type {TextareaHTMLAttributes} from 'react'

import {cn} from '../../lib/cn'

export function Textarea({className, ...props}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[120px] w-full rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-2.5 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft',
        className,
      )}
      {...props}
    />
  )
}
