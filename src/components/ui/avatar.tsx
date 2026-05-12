import type {HTMLAttributes} from 'react'

import {cn} from '../../lib/cn'

export function Avatar({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
}

export function AvatarFallback({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex h-full w-full items-center justify-center rounded-full bg-primary text-xs font-semibold text-white', className)}
      {...props}
    />
  )
}
