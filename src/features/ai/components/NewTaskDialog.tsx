// AI Kanban — +New Task dialog.
//
// Two-step layout:
//   step 'pick'      — JobPicker only. Auto-advances to 'configure'
//                      when the user selects a radio.
//   step 'configure' — Title / Description / (project picker | assignee) /
//                      Repeat / JobConfigInputs. Back button returns to 'pick'.
//
// The split keeps the dialog within the viewport on standard laptop
// heights as the job catalog grows. Edit mode and the `?job=<slug>`
// deep-link both open straight to 'configure' (a job is already chosen).
//
// Auto-fill side-effects live in this component, not in JobPicker —
// the picker only reports which job the user selected.

import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent} from 'react'
import {ChevronLeft, Loader2} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import {Input} from '../../../components/ui/input'
import {Textarea} from '../../../components/ui/textarea'
import {useToast} from '../../../components/ui/toast'
import {captureEvent} from '../../../platform/monitoring/posthog'
import {
  AGENT_JOBS,
  type AgentJob,
  findJobBySlug,
  SOURCE_JOB_SLUG_KEY,
  type JobRepeat,
  type JobPersonaSlug,
} from '../agent-recipes'
import type {AgentSchedule, AssignablePersona} from '../agent.types'
import type {FetchUrlAllowlistEntry} from '../fetch-url-allowlist'
import {AI_AGENT_EVENT} from '../posthog-events'
import type {WorkspaceSummary} from '../../projects/project-shell.types'
import {JobConfigInputs, type JobConfigValue} from './TemplateConfigInputs'
import {PersonaPicker} from './PersonaPicker'
import {JobPicker} from './TemplatePicker'

export type RepeatOption =
  | {kind: 'one_off'}
  | {kind: 'daily'}
  | {kind: 'weekly'}
  | {cron: string; kind: 'cron'}

export type NewTaskFormSubmit = {
  assignToPersonaId: string
  bodyMd: string
  // Extra fields merged into the `card_template` JSONB by the parent
  // (e.g. tags from `cardTemplateExtras`, the `__source_template_slug`
  // marker, resolved placeholders).
  cardTemplateExtras: Record<string, unknown>
  repeat: {kind: 'one_off' | 'daily' | 'weekly'} | {cron: string; kind: 'cron'}
  // Optional override for the schedule's target_project_id. Set when
  // the active Job is a monitor (kind='monitor') so the schedule
  // targets the user-picked project, not their Personal AI Workspace.
  targetProjectId?: string
  // IANA tz for the schedule (e.g., 'America/Los_Angeles'). For monitor
  // jobs, resolved from the target project's workspace; for other
  // recurring jobs, falls back to the recipe's defaultRepeat.timezone
  // (currently always 'UTC'); for one-off submits, ignored by the
  // parent (no schedule is created).
  timezone: string
  title: string
}

export type UpdateScheduleSubmit = {
  cardTemplate: Record<string, unknown>
  newCronExpression: string | null
  newPersonaId: string | null
  newTimezone: string | null
  scheduleId: string
}

type NewTaskDialogProps = {
  // When set, dialog renders in edit mode and submit calls onUpdate.
  editingSchedule?: AgentSchedule | null
  // Allowlist used by JobConfigInputs to render the URL warning.
  fetchUrlAllowlist?: FetchUrlAllowlistEntry[]
  // Pre-select a job + auto-fill fields on first open. Used by the
  // `?job=<slug>` deep-link from the Jobs section.
  initialJob?: AgentJob | null
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onNavigateToProfiles: () => void
  onRetryPersonas: () => void
  onSubmit: (values: NewTaskFormSubmit) => void
  // Required when editingSchedule is set.
  onUpdate?: (values: UpdateScheduleSubmit) => void
  // Org context — passed through to PostHog telemetry on template_picked.
  organizationId?: string | null
  personas: AssignablePersona[]
  personasIsError: boolean
  personasLoading: boolean
  // Workspaces the user can see — used to populate the project picker
  // when the active Job is a monitor. v0.5 flattens all projects across
  // all workspaces into a single dropdown; the RLS layer already filters
  // to ones the user has access to.
  workspaceSummaries?: WorkspaceSummary[]
}

const REPEAT_PRESETS: Array<{kind: 'one_off' | 'daily' | 'weekly' | 'cron'; label: string}> = [
  {kind: 'one_off', label: 'One-off'},
  {kind: 'daily', label: 'Every day at 09:00'},
  {kind: 'weekly', label: 'Every Monday at 09:00'},
  {kind: 'cron', label: 'Advanced cron'},
]

const DAILY_DEFAULT_CRON = '0 9 * * *'
const WEEKLY_DEFAULT_CRON = '0 9 * * 1'

function repeatToInputs(repeat: JobRepeat): {
  cron: string
  kind: RepeatOption['kind']
} {
  if (repeat.kind === 'one_off') {
    return {cron: DAILY_DEFAULT_CRON, kind: 'one_off'}
  }
  if (repeat.cron === DAILY_DEFAULT_CRON) return {cron: repeat.cron, kind: 'daily'}
  if (repeat.cron === WEEKLY_DEFAULT_CRON) return {cron: repeat.cron, kind: 'weekly'}
  return {cron: repeat.cron, kind: 'cron'}
}

function findPersonaBySlug(
  personas: AssignablePersona[],
  slug: JobPersonaSlug,
): AssignablePersona | null {
  return personas.find((p) => p.slug === slug) ?? null
}

// Resolve `${user_input}` placeholders in title/body from the
// JobConfigInputs values so the schedule's card_template carries real
// values, not literal `${crash_log_source_url}`. Server-side
// clone_template_to_card resolves `${date}` / `${week}`.
function applyUserInputPlaceholders(
  text: string,
  values: Record<string, JobConfigValue>,
): string {
  return Object.entries(values).reduce((acc, [key, value]) => {
    const stringValue = typeof value === 'string' ? value : String(value)
    return acc.split('${' + key + '}').join(stringValue)
  }, text)
}

export function NewTaskDialog({
  editingSchedule = null,
  fetchUrlAllowlist = [],
  initialJob = null,
  isOpen,
  isSubmitting,
  onClose,
  onNavigateToProfiles,
  onRetryPersonas,
  onSubmit,
  onUpdate,
  organizationId = null,
  personas,
  personasIsError,
  personasLoading,
  workspaceSummaries = [],
}: NewTaskDialogProps) {
  const {toast} = useToast()
  const isEditMode = editingSchedule !== null

  const [title, setTitle] = useState('')
  const [bodyMd, setBodyMd] = useState('')
  const [assignToPersonaId, setAssignToPersonaId] = useState<string>('')
  const [repeatKind, setRepeatKind] = useState<RepeatOption['kind']>('one_off')
  const [cronExpression, setCronExpression] = useState(DAILY_DEFAULT_CRON)
  const [error, setError] = useState<string | null>(null)
  const [selectedJobSlug, setSelectedJobSlug] = useState<string | null>(null)
  const [jobConfigValues, setJobConfigValues] = useState<
    Record<string, JobConfigValue>
  >({})
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [step, setStep] = useState<'pick' | 'configure'>('pick')

  const activeJob = useMemo(
    () => findJobBySlug(selectedJobSlug),
    [selectedJobSlug],
  )

  const reset = useCallback(() => {
    setTitle('')
    setBodyMd('')
    setAssignToPersonaId('')
    setRepeatKind('one_off')
    setCronExpression(DAILY_DEFAULT_CRON)
    setError(null)
    setSelectedJobSlug(null)
    setJobConfigValues({})
    setSelectedProjectId('')
    setStep('pick')
  }, [])

  const hydratedKeyRef = useRef<string | null>(null)
  const hydratedInitialJobRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      hydratedKeyRef.current = null
      hydratedInitialJobRef.current = null
      return
    }

    if (isEditMode && editingSchedule && hydratedKeyRef.current !== editingSchedule.id) {
      const cardTemplate = editingSchedule.cardTemplate ?? {}
      const sourceSlug =
        typeof cardTemplate[SOURCE_JOB_SLUG_KEY] === 'string'
          ? (cardTemplate[SOURCE_JOB_SLUG_KEY] as string)
          : ''

      setTitle(typeof cardTemplate.title === 'string' ? cardTemplate.title : '')
      setBodyMd(typeof cardTemplate.bodyMd === 'string' ? cardTemplate.bodyMd : '')
      setAssignToPersonaId(editingSchedule.personaId)

      const inputs = repeatToInputs({
        cron: editingSchedule.cronExpression,
        kind: 'cron',
        timezone: editingSchedule.timezone,
      })
      setRepeatKind(inputs.kind)
      setCronExpression(inputs.cron)
      setSelectedJobSlug(sourceSlug)

      const job = findJobBySlug(sourceSlug)
      if (job) {
        const initialValues: Record<string, JobConfigValue> = {}
        for (const req of job.requiresUserInput) {
          const stored = (cardTemplate as Record<string, unknown>)[req.key]
          if (req.kind === 'url' && typeof stored === 'string') {
            initialValues[req.key] = stored
          } else if (req.kind === 'positive_integer' && typeof stored === 'number') {
            initialValues[req.key] = stored
          }
        }
        setJobConfigValues(initialValues)
      } else {
        setJobConfigValues({})
      }
      setSelectedProjectId(editingSchedule.targetProjectId ?? '')
      setError(null)
      setStep('configure')
      hydratedKeyRef.current = editingSchedule.id
      return
    }

    if (
      !isEditMode
      && initialJob
      && hydratedInitialJobRef.current !== initialJob.slug
    ) {
      handleSelectJob(initialJob)
      hydratedInitialJobRef.current = initialJob.slug
    }
    // We deliberately omit handleSelectJob from deps — it captures the
    // latest personas via closure but we only want to fire on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode, editingSchedule, initialJob])

  function handleSelectJob(job: AgentJob | null) {
    setSelectedJobSlug(job?.slug ?? '')
    setStep('configure')

    if (!job) {
      setJobConfigValues({})
      setSelectedProjectId('')
      return
    }

    // Project picker resets every time the user picks a different job —
    // a previously chosen project for a non-monitor job shouldn't leak
    // into a newly picked monitor job's submit (and vice versa).
    setSelectedProjectId('')

    // PostHog event name + property names are kept as `template_picked` /
    // `template_slug` for back-compat with historical analytics data.
    captureEvent(AI_AGENT_EVENT.TEMPLATE_PICKED, {
      organization_id: organizationId,
      template_slug: job.slug,
      persona_slug: job.personaSlug,
      repeat_kind: job.defaultRepeat.kind,
    })

    setTitle(job.defaultTitle)
    setBodyMd(job.defaultBodyMd)

    const persona = findPersonaBySlug(personas, job.personaSlug)
    if (persona) {
      setAssignToPersonaId(persona.id)
    } else if (personas.length > 0) {
      toast({
        description: `Configure ${job.personaSlug} in AI Agent Profiles to use this job.`,
        title: `Agent ${job.personaSlug} unavailable`,
        variant: 'error',
      })
    }

    if (job.recurringDisabled) {
      setRepeatKind('one_off')
    } else if (job.defaultRepeat.kind === 'cron') {
      const inputs = repeatToInputs(job.defaultRepeat)
      setRepeatKind(inputs.kind)
      setCronExpression(inputs.cron)
    } else {
      setRepeatKind('one_off')
    }

    const initialValues: Record<string, JobConfigValue> = {}
    for (const req of job.requiresUserInput) {
      if (req.kind === 'positive_integer' && typeof req.defaultValue === 'number') {
        initialValues[req.key] = req.defaultValue
      }
    }
    setJobConfigValues(initialValues)
  }

  const handleClose = () => {
    if (isSubmitting) return
    reset()
    onClose()
  }

  const handleNavigateToProfiles = () => {
    if (isSubmitting) return
    reset()
    onNavigateToProfiles()
    onClose()
  }

  const showEmptyState =
    personasIsError || (!personasLoading && personas.length === 0)
  const submitDisabled = isSubmitting || showEmptyState

  const recurringDisabledByJob = activeJob?.recurringDisabled === true
  const oneOffHiddenInEditMode = isEditMode
  // Monitor jobs lock down: persona is fixed by the Job (no assignee
  // override), repeat is fixed by `defaultRepeat` (no radio), one-off
  // is hidden, and a project picker replaces the URL/integer inputs.
  const isMonitorJob = activeJob?.kind === 'monitor'

  const headerTitle = isEditMode
    ? activeJob
      ? `Edit ${activeJob.name}`
      : 'Edit schedule'
    : 'New task'
  const headerDescription = isEditMode
    ? "Adjust this schedule's settings. Pick a different job to start over."
    : step === 'pick'
      ? 'Pick a job to get started, or start blank.'
      : 'Dispatch an AI agent on a free-form task. The card lands in your Personal AI Workspace.'
  const submitLabel = isEditMode
    ? 'Save changes'
    : repeatKind === 'one_off'
      ? 'Create & dispatch'
      : 'Create schedule'

  function buildCardTemplateExtras(): Record<string, unknown> {
    if (!activeJob) return {}
    const extras: Record<string, unknown> = {
      ...(activeJob.cardTemplateExtras ?? {}),
      [SOURCE_JOB_SLUG_KEY]: activeJob.slug,
    }
    for (const req of activeJob.requiresUserInput) {
      // project_picker resolves to `targetProjectId` on the submit
      // payload — it is not stamped onto card_template (the schedule's
      // own column carries it).
      if (req.kind === 'project_picker') continue
      const value = jobConfigValues[req.key]
      if (value === undefined || value === '') continue
      extras[req.key] = value
    }
    return extras
  }

  function validateJobInputs(): string | null {
    if (!activeJob) return null
    for (const req of activeJob.requiresUserInput) {
      if (req.kind === 'project_picker') {
        if (!selectedProjectId) {
          return `Pick a project to watch before submitting.`
        }
        continue
      }
      const value = jobConfigValues[req.key]
      if (value === undefined || value === '') {
        return `Fill in ${req.label.toLowerCase()} before submitting.`
      }
      if (req.kind === 'positive_integer' && (typeof value !== 'number' || value < 1)) {
        return `${req.label} must be a positive integer.`
      }
    }
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const resolvedTitle = activeJob
      ? applyUserInputPlaceholders(title, jobConfigValues).trim()
      : title.trim()
    const resolvedBody = activeJob
      ? applyUserInputPlaceholders(bodyMd, jobConfigValues).trim()
      : bodyMd.trim()

    if (!resolvedTitle) {
      setError('Title is required.')
      return
    }
    if (!isEditMode && !assignToPersonaId) {
      setError('Choose an agent to assign the task to.')
      return
    }
    if (repeatKind === 'cron' && !cronExpression.trim()) {
      setError('Enter a cron expression (5 fields).')
      return
    }
    const jobError = validateJobInputs()
    if (jobError) {
      setError(jobError)
      return
    }

    setError(null)

    if (isEditMode && editingSchedule) {
      const cardTemplate: Record<string, unknown> = {
        bodyMd: resolvedBody,
        title: resolvedTitle,
        ...buildCardTemplateExtras(),
      }
      const newCron =
        repeatKind === 'cron'
          ? cronExpression.trim()
          : repeatKind === 'daily'
            ? DAILY_DEFAULT_CRON
            : repeatKind === 'weekly'
              ? WEEKLY_DEFAULT_CRON
              : null
      const personaChanged = assignToPersonaId !== editingSchedule.personaId
      const cronChanged = newCron !== null && newCron !== editingSchedule.cronExpression
      onUpdate?.({
        cardTemplate,
        newCronExpression: cronChanged ? newCron : null,
        newPersonaId: personaChanged ? assignToPersonaId : null,
        newTimezone: null,
        scheduleId: editingSchedule.id,
      })
      return
    }

    const cardTemplateExtras = buildCardTemplateExtras()
    const targetProjectId = isMonitorJob ? selectedProjectId : undefined

    // Resolve schedule timezone. Monitor jobs use the target project's
    // workspace timezone so daily-cron jobs (e.g., Sprint Manager) fire
    // at 09:00 in the workspace's local time. Non-monitor recurring jobs
    // fall back to the recipe's defaultRepeat.timezone — currently 'UTC'
    // across all recipes. One-off submits ignore this. (Edit-mode caveat:
    // if the project later moves workspaces, the stored timezone won't
    // auto-update.)
    let resolvedTimezone = 'UTC'
    if (isMonitorJob && selectedProjectId) {
      const workspace = workspaceSummaries.find((ws) =>
        ws.projects.some((p) => p.id === selectedProjectId),
      )
      if (workspace?.timezone) {
        resolvedTimezone = workspace.timezone
      }
    } else if (
      activeJob
      && activeJob.defaultRepeat.kind === 'cron'
      && activeJob.defaultRepeat.timezone
    ) {
      resolvedTimezone = activeJob.defaultRepeat.timezone
    }

    if (repeatKind === 'one_off') {
      onSubmit({
        assignToPersonaId,
        bodyMd: resolvedBody,
        cardTemplateExtras,
        repeat: {kind: 'one_off'},
        targetProjectId,
        timezone: resolvedTimezone,
        title: resolvedTitle,
      })
      return
    }

    onSubmit({
      assignToPersonaId,
      bodyMd: resolvedBody,
      cardTemplateExtras,
      repeat:
        repeatKind === 'cron'
          ? {cron: cronExpression.trim(), kind: 'cron'}
          : {kind: repeatKind},
      targetProjectId,
      timezone: resolvedTimezone,
      title: resolvedTitle,
    })
  }

  return (
    <Dialog onOpenChange={(open) => (!open ? handleClose() : undefined)} open={isOpen}>
      <DialogContent className='w-[min(36rem,calc(100vw-2rem))]'>
        <DialogHeader>
          <DialogTitle className='max-w-[20rem] truncate'>{headerTitle}</DialogTitle>
          <DialogDescription>{headerDescription}</DialogDescription>
        </DialogHeader>

        <form className='flex flex-col gap-4 px-6 py-5' onSubmit={handleSubmit}>
          {step === 'pick' ? (
            showEmptyState ? (
              <div
                className='flex flex-col items-start gap-2 rounded-2xl border border-border-subtle bg-surface-muted p-4'
                data-testid='new-task-empty-state'
              >
                <h3 className='font-display text-base font-semibold text-text-strong'>
                  No agents are dispatchable yet
                </h3>
                <p className='text-sm text-text-medium'>
                  Open AI Agent Profiles to set up your AI team.
                </p>
                <Button
                  disabled={isSubmitting}
                  onClick={handleNavigateToProfiles}
                  type='button'
                  variant='ghost'
                >
                  Open AI Agent Profiles →
                </Button>
                {personasIsError ? (
                  <Button
                    disabled={isSubmitting}
                    onClick={onRetryPersonas}
                    type='button'
                    variant='ghost'
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : (
              <JobPicker
                disabled={isSubmitting}
                jobs={AGENT_JOBS}
                onSelect={handleSelectJob}
                selectedSlug={selectedJobSlug}
              />
            )
          ) : (
            <>
              <label className='flex flex-col gap-1.5'>
                <span className='text-sm font-medium text-text-strong'>Title</span>
                <Input
                  autoFocus
                  disabled={isSubmitting}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder='Summarize the latest customer feedback'
                  value={title}
                />
              </label>

              <label className='flex flex-col gap-1.5'>
                <span className='text-sm font-medium text-text-strong'>Description</span>
                <Textarea
                  disabled={isSubmitting}
                  onChange={(event) => setBodyMd(event.target.value)}
                  placeholder='What should the agent do? Markdown supported.'
                  rows={4}
                  value={bodyMd}
                />
              </label>

              {isMonitorJob ? (
                <label className='flex flex-col gap-1.5' data-testid='monitor-project-picker'>
                  <span className='text-sm font-medium text-text-strong'>Project to watch</span>
                  <select
                    className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
                    disabled={isSubmitting}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    value={selectedProjectId}
                  >
                    <option value=''>Pick a project</option>
                    {workspaceSummaries.flatMap((ws) =>
                      ws.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {ws.name} / {project.name}
                        </option>
                      )),
                    )}
                  </select>
                  <p className='text-xs text-text-muted'>
                    The selected agent scans this project on the cron cadence and queues
                    Auto-flag comments + inbox messages for your approval.
                  </p>
                </label>
              ) : null}

              <label className='flex flex-col gap-1.5'>
                <span className='text-sm font-medium text-text-strong'>Assign to</span>
                <PersonaPicker
                  disabled={isSubmitting || showEmptyState}
                  isLoading={personasLoading}
                  onSelect={setAssignToPersonaId}
                  personas={personas}
                  selectedPersonaId={assignToPersonaId}
                />
              </label>

              {isMonitorJob ? null : (
                <fieldset className='flex flex-col gap-2'>
                  <legend className='text-sm font-medium text-text-strong'>Repeat</legend>
                  {REPEAT_PRESETS.map((preset) => {
                    if (preset.kind === 'one_off' && oneOffHiddenInEditMode) return null
                    const isRecurring = preset.kind !== 'one_off'
                    const lockedByJob = isRecurring && recurringDisabledByJob
                    const tooltip = lockedByJob
                      ? 'Manual one-off in v1; auto-trigger on bug-tagged cards is coming.'
                      : undefined
                    return (
                      <label
                        className='flex items-center gap-2 text-sm text-text-medium'
                        key={preset.kind}
                        title={tooltip}
                      >
                        <input
                          checked={repeatKind === preset.kind}
                          data-testid={`repeat-${preset.kind}`}
                          disabled={isSubmitting || lockedByJob}
                          name='repeat'
                          onChange={() => setRepeatKind(preset.kind)}
                          type='radio'
                          value={preset.kind}
                        />
                        {preset.label}
                      </label>
                    )
                  })}
                  {repeatKind === 'cron' ? (
                    <Input
                      aria-label='Cron expression'
                      disabled={isSubmitting}
                      onChange={(event) => setCronExpression(event.target.value)}
                      placeholder='0 9 * * 1-5'
                      value={cronExpression}
                    />
                  ) : null}
                </fieldset>
              )}

              {activeJob ? (
                <JobConfigInputs
                  allowlist={fetchUrlAllowlist}
                  disabled={isSubmitting}
                  onChange={(key, value) =>
                    setJobConfigValues((prev) => ({...prev, [key]: value}))
                  }
                  requirements={activeJob.requiresUserInput}
                  values={jobConfigValues}
                />
              ) : null}

              {error ? (
                <p className='rounded-xl bg-error/10 px-3 py-2 text-sm text-error'>{error}</p>
              ) : null}
            </>
          )}

          <footer className='flex justify-between gap-3'>
            {step === 'configure' ? (
              <Button
                data-testid='back-to-picker'
                disabled={isSubmitting}
                onClick={() => setStep('pick')}
                type='button'
                variant='ghost'
              >
                <ChevronLeft className='h-4 w-4' aria-hidden='true'/>
                Back
              </Button>
            ) : (
              <span/>
            )}
            <div className='flex gap-3'>
              <Button disabled={isSubmitting} onClick={handleClose} type='button' variant='ghost'>
                Cancel
              </Button>
              {step === 'configure' ? (
                <Button disabled={submitDisabled} type='submit' variant='primary'>
                  {isSubmitting ? <Loader2 className='h-4 w-4 animate-spin'/> : null}
                  {submitLabel}
                </Button>
              ) : null}
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
