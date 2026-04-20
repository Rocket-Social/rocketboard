import {cva, type VariantProps} from 'class-variance-authority'
import type {ButtonHTMLAttributes} from 'react'

import {cn} from '../../lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary px-4 py-2 text-white hover:brightness-110',
        secondary: 'border border-border-subtle bg-surface-elevated px-3 py-2 text-text-medium hover:border-border-strong hover:bg-surface-base hover:text-text-strong',
        ghost: 'px-3 py-2 text-text-medium hover:bg-canvas-accent hover:text-text-strong',
        icon: 'h-9 w-9 rounded-xl text-text-muted hover:bg-canvas-accent hover:text-text-strong',
      },
      size: {
        default: '',
        compact: 'px-2.5 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export function Button({className, size, variant, ...props}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({variant, size}), className)}
      {...props}
    />
  )
}
