import {Button} from '../../../components/ui/button'

export function ReleasesEmptyState({onAddRelease}: {onAddRelease: () => void}) {
  return (
    <div className='rounded-[28px] border border-dashed border-border-subtle bg-surface-elevated/60 px-6 py-14 text-center shadow-panel'>
      <div className='mx-auto flex w-fit items-center gap-3 text-text-muted'>
        <span className='h-2.5 w-2.5 rounded-full border border-border-subtle'/>
        <span className='h-px w-14 border-t border-dashed border-border-subtle'/>
        <span className='h-2.5 w-2.5 rounded-full border border-border-subtle'/>
        <span className='h-px w-14 border-t border-dashed border-border-subtle'/>
        <span className='h-2.5 w-2.5 rounded-full border border-border-subtle'/>
      </div>

      <h2 className='mt-6 font-display text-lg font-semibold text-text-strong'>What ships and when</h2>
      <p className='mx-auto mt-3 max-w-md text-sm text-text-medium'>
        Track planned dates, actual ship dates, drift, and change notes for every release in one place.
      </p>

      <div className='mt-6'>
        <Button onClick={onAddRelease} variant='primary'>+ Add first release</Button>
      </div>
    </div>
  )
}
