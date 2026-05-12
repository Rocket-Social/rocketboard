// AI Kanban — Job-specific config inputs (URL / positive integer /
// project picker for monitor jobs).
//
// File name kept as `TemplateConfigInputs.tsx` for git history; the
// exported component and types use the `Job` vocabulary.
//
// Renders one input per `JobRequirement`. Supported kinds:
//   - 'url'              — <input type='url'> + parse + allowlist warning
//   - 'positive_integer' — <input type='number' min='1' step='1'>
//   - 'project_picker'   — handled by NewTaskDialog (project queries
//                          live there); ignored here.
//
// The allowlist warning is render-only — actual deny happens server-side.

import {AlertTriangle} from 'lucide-react'

import {Input} from '../../../components/ui/input'
import type {JobRequirement} from '../agent-recipes'
import {
  type FetchUrlAllowlistEntry,
  hostMatchesAllowlist,
  parseHostname,
} from '../fetch-url-allowlist'

export type JobConfigValue = number | string

type JobConfigInputsProps = {
  allowlist: FetchUrlAllowlistEntry[]
  disabled?: boolean
  onChange: (key: string, value: JobConfigValue) => void
  requirements: readonly JobRequirement[]
  values: Record<string, JobConfigValue>
}

export function JobConfigInputs({
  allowlist,
  disabled,
  onChange,
  requirements,
  values,
}: JobConfigInputsProps) {
  // Filter out non-input requirements (project_picker is owned by the
  // dialog, not this component).
  const inputRequirements = requirements.filter(
    (req) => req.kind === 'url' || req.kind === 'positive_integer',
  )
  if (inputRequirements.length === 0) return null

  return (
    <fieldset className='flex flex-col gap-3' data-testid='job-config-inputs'>
      <legend className='text-sm font-medium text-text-strong'>Job settings</legend>
      {inputRequirements.map((req) => {
        const value = values[req.key]
        if (req.kind === 'url') {
          const stringValue = typeof value === 'string' ? value : ''
          const hostname = parseHostname(stringValue)
          const showAllowlistWarning =
            hostname !== null && !hostMatchesAllowlist(hostname, allowlist)
          return (
            <label className='flex flex-col gap-1.5' key={req.key}>
              <span className='text-sm font-medium text-text-strong'>{req.label}</span>
              <Input
                data-testid={`job-config-${req.key}`}
                disabled={disabled}
                onChange={(event) => onChange(req.key, event.target.value)}
                placeholder={req.placeholder}
                type='url'
                value={stringValue}
              />
              {showAllowlistWarning ? (
                <p
                  className='flex items-start gap-1.5 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning'
                  data-testid={`job-config-${req.key}-allowlist-warning`}
                >
                  <AlertTriangle aria-hidden='true' className='mt-0.5 h-3.5 w-3.5 shrink-0'/>
                  <span>
                    Add <code className='font-mono'>{hostname}</code> to your org&apos;s
                    fetch_url allowlist before this job runs.
                  </span>
                </p>
              ) : null}
            </label>
          )
        }
        // positive_integer
        const numericValue =
          typeof value === 'number' && Number.isFinite(value) ? value : (req.defaultValue ?? '')
        return (
          <label className='flex flex-col gap-1.5' key={req.key}>
            <span className='text-sm font-medium text-text-strong'>{req.label}</span>
            <Input
              data-testid={`job-config-${req.key}`}
              disabled={disabled}
              min='1'
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '') {
                  onChange(req.key, '')
                  return
                }
                const parsed = Number.parseInt(raw, 10)
                if (Number.isNaN(parsed) || parsed < 1) {
                  onChange(req.key, '')
                  return
                }
                onChange(req.key, parsed)
              }}
              placeholder={req.placeholder}
              step='1'
              type='number'
              value={String(numericValue)}
            />
          </label>
        )
      })}
    </fieldset>
  )
}
