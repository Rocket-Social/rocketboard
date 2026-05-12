// AI Kanban — Job catalog card.
//
// File name kept as `TemplateCard.tsx` for git history; the exported
// component and surrounding vocabulary are `Job` after the founder
// vocabulary call. Click navigates to /ai-agents?tab=kanban&job=<slug>;
// MyAiKanbanTab's deep-link handler picks up the param, opens
// NewTaskDialog with the job pre-selected, and strips the param.

import {ArrowRight, Sparkles} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import type {AgentJob} from '../agent-recipes'

type JobCardProps = {
  job: AgentJob
  onUseJob: (slug: string) => void
}

export function JobCard({job, onUseJob}: JobCardProps) {
  return (
    <article
      className='flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-panel'
      data-testid={`job-card-${job.slug}`}
    >
      <header className='flex items-center gap-2'>
        <Sparkles aria-hidden='true' className='h-4 w-4 text-primary'/>
        <h3 className='font-display text-base font-semibold text-text-strong'>
          {job.name}
        </h3>
      </header>
      <p className='text-sm text-text-medium'>{job.description}</p>
      <p className='text-xs text-text-muted'>{job.configSummary}</p>
      <Button
        className='w-full justify-center'
        data-testid={`job-card-${job.slug}-use`}
        onClick={() => onUseJob(job.slug)}
        type='button'
        variant='primary'
      >
        Use this job
        <ArrowRight aria-hidden='true' className='h-4 w-4'/>
      </Button>
    </article>
  )
}
