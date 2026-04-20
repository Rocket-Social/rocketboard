import * as PopoverPrimitive from '@radix-ui/react-popover'
import {forwardRef, type ComponentPropsWithoutRef, type ElementRef} from 'react'

import {cn} from '../../lib/cn'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({className, sideOffset = 8, ...props}, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      className={cn(
        'z-50 rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-text-strong shadow-float outline-none',
        className,
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </PopoverPrimitive.Portal>
))

PopoverContent.displayName = PopoverPrimitive.Content.displayName
