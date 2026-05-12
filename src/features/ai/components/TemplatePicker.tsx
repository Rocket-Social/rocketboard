// AI Kanban — Job radio picker for NewTaskDialog.
//
// File name kept as `TemplatePicker.tsx` for git history; the exported
// component is `JobPicker` after the founder vocabulary call. Stateless
// w.r.t. the dialog: the picker reports which job the user selected via
// `onSelect`. The dialog handles auto-fill side-effects.
//
// Layout: 1 + N radio cards ("Blank task" + N jobs) in a 2-column grid on
// sm+ viewports, single column below. Selecting Blank task returns
// onSelect(null).

import {Sparkles} from 'lucide-react'

import type {AgentJob} from '../agent-recipes'

type JobPickerProps = {
  disabled?: boolean
  jobs: readonly AgentJob[]
  onSelect: (job: AgentJob | null) => void
  // null = no pre-selection (radios all unchecked); '' = Blank task is
  // selected; otherwise the slug of a selected job. The two-step flow
  // opens with null so a click on Blank task fires onChange and
  // advances the step (an already-checked radio doesn't fire change).
  selectedSlug: string | null
}

export function JobPicker({
  disabled,
  jobs,
  onSelect,
  selectedSlug,
}: JobPickerProps) {
  return (
    <fieldset className='flex flex-col gap-2' data-testid='job-picker'>
      <legend className='text-sm font-medium text-text-strong'>Start from job</legend>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <label className='flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-base p-3 hover:bg-surface-muted'>
          <input
            checked={selectedSlug === ''}
            className='mt-0.5'
            data-testid='job-picker-blank'
            disabled={disabled}
            name='job'
            onChange={() => onSelect(null)}
            type='radio'
            value=''
          />
          <span className='flex flex-1 flex-col gap-0.5'>
            <span className='text-sm font-medium text-text-strong'>Blank task</span>
            <span className='text-xs text-text-muted'>
              Free-form one-off or recurring task you write yourself.
            </span>
          </span>
        </label>
        {jobs.map((job) => (
          <label
            className='flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-base p-3 hover:bg-surface-muted'
            key={job.slug}
          >
            <input
              checked={selectedSlug === job.slug}
              className='mt-0.5'
              data-testid={`job-picker-${job.slug}`}
              disabled={disabled}
              name='job'
              onChange={() => onSelect(job)}
              type='radio'
              value={job.slug}
            />
            <span className='flex flex-1 flex-col gap-0.5'>
              <span className='flex items-center gap-1.5 text-sm font-medium text-text-strong'>
                <Sparkles className='h-3.5 w-3.5 text-primary' aria-hidden='true'/>
                {job.name}
              </span>
              <span className='text-xs text-text-muted'>{job.description}</span>
              <span className='text-xs text-text-muted'>{job.configSummary}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
