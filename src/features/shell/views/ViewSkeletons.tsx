/**
 * Skeleton loading placeholders for each view type.
 * Shown as Suspense fallbacks during lazy view loading and route transitions.
 */

const shimmer = 'animate-pulse rounded bg-border-subtle'

function SkeletonRow({columns}: {columns: number}) {
  return (
    <div className='flex items-center gap-4 border-b border-border-subtle px-4 py-3'>
      <div className={`h-4 w-6 ${shimmer}`}/>
      <div className={`h-4 flex-1 ${shimmer}`}/>
      {Array.from({length: columns - 1}, (_, i) => (
        <div className={`h-4 w-20 ${shimmer}`} key={i}/>
      ))}
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className='flex flex-col'>
      {/* Header */}
      <div className='flex items-center gap-4 border-b border-border-subtle bg-surface-base px-4 py-2'>
        <div className={`h-3 w-6 ${shimmer}`}/>
        <div className={`h-3 w-32 ${shimmer}`}/>
        <div className={`h-3 w-20 ${shimmer}`}/>
        <div className={`h-3 w-20 ${shimmer}`}/>
        <div className={`h-3 w-20 ${shimmer}`}/>
        <div className={`h-3 w-20 ${shimmer}`}/>
      </div>
      {/* Group header */}
      <div className='flex items-center gap-3 border-b border-border-subtle bg-surface-base px-4 py-2.5'>
        <div className={`h-4 w-4 ${shimmer}`}/>
        <div className={`h-4 w-28 ${shimmer}`}/>
        <div className={`h-4 w-8 ${shimmer}`}/>
      </div>
      {/* Rows */}
      {Array.from({length: 8}, (_, i) => (
        <SkeletonRow columns={5} key={i}/>
      ))}
      {/* Second group */}
      <div className='flex items-center gap-3 border-b border-border-subtle bg-surface-base px-4 py-2.5'>
        <div className={`h-4 w-4 ${shimmer}`}/>
        <div className={`h-4 w-24 ${shimmer}`}/>
        <div className={`h-4 w-8 ${shimmer}`}/>
      </div>
      {Array.from({length: 4}, (_, i) => (
        <SkeletonRow columns={5} key={`g2-${i}`}/>
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className='rounded-xl border border-border-subtle bg-surface-elevated p-3'>
      <div className={`mb-2 h-4 w-3/4 ${shimmer}`}/>
      <div className={`mb-3 h-3 w-1/2 ${shimmer}`}/>
      <div className='flex gap-1.5'>
        <div className={`h-5 w-12 rounded-full ${shimmer}`}/>
        <div className={`h-5 w-16 rounded-full ${shimmer}`}/>
      </div>
    </div>
  )
}

export function BoardSkeleton() {
  return (
    <div className='flex gap-4 overflow-hidden p-4'>
      {Array.from({length: 4}, (_, col) => (
        <div className='flex w-72 flex-shrink-0 flex-col gap-3' key={col}>
          <div className='flex items-center gap-2 px-1'>
            <div className={`h-4 w-20 ${shimmer}`}/>
            <div className={`h-4 w-6 ${shimmer}`}/>
          </div>
          {Array.from({length: 3 - Math.floor(col / 2)}, (_, card) => (
            <SkeletonCard key={card}/>
          ))}
        </div>
      ))}
    </div>
  )
}

export function GanttSkeleton() {
  return (
    <div className='flex flex-col'>
      {/* Timeline header */}
      <div className='flex border-b border-border-subtle'>
        <div className='w-64 flex-shrink-0 border-r border-border-subtle px-4 py-2'>
          <div className={`h-3 w-16 ${shimmer}`}/>
        </div>
        <div className='flex flex-1 gap-0'>
          {Array.from({length: 12}, (_, i) => (
            <div className='w-24 flex-shrink-0 border-r border-border-subtle px-2 py-2' key={i}>
              <div className={`h-3 w-12 ${shimmer}`}/>
            </div>
          ))}
        </div>
      </div>
      {/* Task rows */}
      {Array.from({length: 8}, (_, i) => (
        <div className='flex border-b border-border-subtle' key={i}>
          <div className='flex w-64 flex-shrink-0 items-center gap-2 border-r border-border-subtle px-4 py-2.5'>
            <div className={`h-4 w-4 ${shimmer}`}/>
            <div className={`h-4 ${shimmer}`} style={{width: `${60 + ((i * 37) % 80)}px`}}/>
          </div>
          <div className='relative flex-1 py-2.5'>
            <div
              className={`absolute h-5 rounded ${shimmer}`}
              style={{left: `${40 + i * 30}px`, width: `${80 + ((i * 53) % 120)}px`}}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <div className='flex flex-col gap-6 p-6'>
      {/* Summary cards */}
      <div className='grid grid-cols-4 gap-4'>
        {Array.from({length: 4}, (_, i) => (
          <div className='rounded-xl border border-border-subtle bg-surface-elevated p-4' key={i}>
            <div className={`mb-2 h-3 w-16 ${shimmer}`}/>
            <div className={`h-8 w-12 ${shimmer}`}/>
          </div>
        ))}
      </div>
      {/* Chart area */}
      <div className='rounded-xl border border-border-subtle bg-surface-elevated p-6'>
        <div className={`mb-4 h-4 w-32 ${shimmer}`}/>
        <div className={`h-48 w-full ${shimmer}`}/>
      </div>
    </div>
  )
}

/**
 * Returns the appropriate skeleton based on the view type segment in the URL path.
 * Falls back to TableSkeleton if the segment can't be determined.
 */
export function ViewSkeleton({viewType}: {viewType?: string}) {
  switch (viewType) {
    case 'board': return <BoardSkeleton/>
    case 'gantt': return <GanttSkeleton/>
    case 'overview': return <OverviewSkeleton/>
    default: return <TableSkeleton/>
  }
}
