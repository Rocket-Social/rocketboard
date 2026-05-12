// AI Kanban — Jobs catalog section.
//
// File name kept as `TemplateSection.tsx` for git history; the exported
// component is `JobsSection` after the founder vocabulary call. Cards-
// earn-existence rule applies — each card IS the interaction unit.

import {AGENT_JOBS} from '../agent-recipes'
import {JobCard} from './TemplateCard'

type JobsSectionProps = {
  onUseJob: (slug: string) => void
}

export function JobsSection({onUseJob}: JobsSectionProps) {
  return (
    <section aria-label='Jobs' data-testid='jobs-section'>
      <h2 className='font-display text-base font-semibold text-text-strong'>Jobs</h2>
      <p className='mt-1 text-sm text-text-muted'>
        Pre-built jobs you can drop into any project.
      </p>
      <div className='mt-3 flex flex-col gap-3'>
        {AGENT_JOBS.map((job) => (
          <JobCard key={job.slug} job={job} onUseJob={onUseJob}/>
        ))}
      </div>
    </section>
  )
}
