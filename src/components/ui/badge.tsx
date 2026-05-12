import {cva, type VariantProps} from 'class-variance-authority'
import type {HTMLAttributes} from 'react'

import {cn} from '../../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        subtle: 'bg-canvas-accent text-text-medium',
        primary: 'bg-primary-soft text-primary',
        count: 'rounded-lg bg-canvas-accent font-mono text-text-medium',
        'plan-free': 'bg-surface-muted text-text-muted',
        'plan-pro': 'bg-primary/10 text-primary',
        'plan-award': 'bg-warning/10 text-warning',
        'plan-vip': 'bg-secondary-soft text-secondary',
      },
    },
    defaultVariants: {
      variant: 'subtle',
    },
  },
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({className, variant, ...props}: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({variant}), className)}
      {...props}
    />
  )
}
