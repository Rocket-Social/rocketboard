import type {OverviewWidgetType} from '../../../projects/project-view.types'

type WidgetSkeletonProps = {
  type: OverviewWidgetType
}

function ShimmerBar({className}: {className?: string}) {
  return <div className={`animate-pulse rounded bg-surface-muted ${className ?? ''}`}/>
}

export function WidgetSkeleton({type}: WidgetSkeletonProps) {
  switch (type) {
    case 'progress_status':
      return (
        <div className='space-y-3'>
          <ShimmerBar className='h-3 w-full'/>
          <ShimmerBar className='h-4 w-3/4'/>
          <ShimmerBar className='h-4 w-1/2'/>
          <ShimmerBar className='h-4 w-2/3'/>
          <ShimmerBar className='h-4 w-1/3'/>
        </div>
      )
    case 'burn_up':
    case 'burn_down':
      return (
        <div className='flex flex-col gap-2'>
          <ShimmerBar className='h-4 w-24 self-end'/>
          <ShimmerBar className='h-[140px] w-full'/>
          <div className='flex justify-center gap-6'>
            <ShimmerBar className='h-3 w-16'/>
            <ShimmerBar className='h-3 w-16'/>
          </div>
        </div>
      )
    case 'priority_assignees':
      return (
        <div className='space-y-3 pt-10'>
          {[1, 2, 3, 4].map((i) => (
            <div className='flex items-center gap-2' key={i}>
              <ShimmerBar className='h-5 w-5 rounded-full'/>
              <ShimmerBar className='h-4 flex-1'/>
              <ShimmerBar className='h-4 w-12'/>
            </div>
          ))}
        </div>
      )
    case 'progress_bar':
      return (
        <div className='flex flex-col items-center gap-4'>
          <ShimmerBar className='h-8 w-16'/>
          <ShimmerBar className='h-4 w-full'/>
          <div className='flex gap-4'>
            <ShimmerBar className='h-3 w-20'/>
            <ShimmerBar className='h-3 w-20'/>
          </div>
        </div>
      )
  }
}
