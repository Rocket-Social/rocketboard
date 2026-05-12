import {Flame, Rocket} from 'lucide-react'

import type {Mode} from '../../app/mode'
import {cn} from '../../lib/cn'

export function RocketLogo({className}: {className?: string}) {
  return <Rocket className={className} strokeWidth={1.9}/>
}

export function RocketboardBrandMark({
  className,
  mode,
}: {
  className?: string
  mode: Mode
}) {
  const badgeClassName =
    mode === 'light'
      ? 'bg-primary text-white shadow-sm'
      : mode === 'dark'
        ? 'border border-white/15 bg-white text-slate-950 shadow-sm'
        : 'bg-primary text-white'

  return (
    <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', badgeClassName, className)}>
      {mode === 'ember' ? <Flame className='h-[18px] w-[18px]'/> : <RocketLogo className='h-[18px] w-[18px]'/>}
    </div>
  )
}
