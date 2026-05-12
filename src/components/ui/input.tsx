import type {InputHTMLAttributes} from 'react'

import {cn} from '../../lib/cn'

export function Input({className, ...props}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft',
        className,
      )}
      {...props}
    />
  )
}
