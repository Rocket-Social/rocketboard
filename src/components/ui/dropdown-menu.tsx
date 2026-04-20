import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import {forwardRef, type ComponentPropsWithoutRef, type ElementRef} from 'react'

import {cn} from '../../lib/cn'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({className, sideOffset = 8, ...props}, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      className={cn(
        'z-[70] min-w-[14rem] rounded-2xl border border-border-subtle bg-surface-elevated p-1.5 text-text-strong shadow-float outline-none',
        className,
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))

DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({className, ...props}, ref) => (
  <DropdownMenuPrimitive.Item
    className={cn(
      'flex cursor-default select-none items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-medium outline-none transition-colors focus:bg-canvas-accent focus:text-text-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))

DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export function DropdownMenuLabel({className, ...props}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('px-3 py-2 text-xs font-medium uppercase tracking-wider text-text-muted', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({className, ...props}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('my-1 h-px bg-border-subtle', className)}
      {...props}
    />
  )
}
