import {Archive, PlusCircle, Rows4} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../components/ui/button'
import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import {Textarea} from '../../components/ui/textarea'
import {Badge} from '../../components/ui/badge'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {useArchiveCustomFieldMutation, useCreateCustomFieldMutation} from './field.queries'
import type {CustomFieldDefinition, CustomFieldType} from './field.types'

type FieldManagerDialogProps = {
  customFields: CustomFieldDefinition[]
  isOpen: boolean
  onClose: () => void
  projectId: string
}

const fieldTypeLabels: Record<CustomFieldType, string> = {
  date: 'Date',
  number: 'Number',
  single_select: 'Single select',
  text: 'Text',
}

function parseOptionInput(value: string) {
  const normalizedOptions: string[] = []

  for (const entry of value.split(/\n|,/)) {
    const normalized = entry.trim()

    if (normalized && !normalizedOptions.includes(normalized)) {
      normalizedOptions.push(normalized)
    }
  }

  return normalizedOptions
}

export function FieldManagerDialog({
  customFields,
  isOpen,
  onClose,
  projectId,
}: FieldManagerDialogProps) {
  const createFieldMutation = useCreateCustomFieldMutation(projectId)
  const archiveFieldMutation = useArchiveCustomFieldMutation(projectId)
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const [fieldName, setFieldName] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldType>('text')
  const [fieldOptionsText, setFieldOptionsText] = useState('')
  const parsedOptions = useMemo(() => parseOptionInput(fieldOptionsText), [fieldOptionsText])

  const errorMessage = [createFieldMutation.error, archiveFieldMutation.error].find(
    (candidate): candidate is Error => candidate instanceof Error,
  )?.message ?? null
  const createDisabled =
    !fieldName.trim()
    || createFieldMutation.isPending
    || (fieldType === 'single_select' && parsedOptions.length === 0)

  const handleCreate = () => {
    if (createDisabled) {
      return
    }

    createFieldMutation.mutate(
      {
        fieldType,
        name: fieldName,
        options: fieldType === 'single_select' ? parsedOptions : [],
      },
      {
        onSuccess: () => {
          setFieldName('')
          setFieldType('text')
          setFieldOptionsText('')
        },
      },
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='h-[min(46rem,calc(100vh-2rem))] w-[min(52rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] bg-surface-base p-0'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Custom Fields</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Manage project fields</DialogTitle>
          <DialogDescription className='mt-2'>
            Custom fields appear in table views and card details. Archiving hides them from new edits without deleting historical values.
          </DialogDescription>
        </DialogHeader>

        <div className='grid h-[calc(100%-5.5rem)] gap-6 overflow-hidden px-6 py-5 lg:grid-cols-[1.05fr_0.95fr]'>
          <section className='overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <Rows4 className='h-4 w-4 text-text-muted'/>
              <h3 className='font-display text-lg font-semibold text-text-strong'>
                Active fields ({customFields.length})
              </h3>
            </div>

            <div className='mt-4 h-[calc(100%-2rem)] space-y-3 overflow-y-auto pr-1'>
              {customFields.length > 0 ? (
                customFields.map((field) => {
                  const archivingThisField =
                    archiveFieldMutation.isPending
                    && archiveFieldMutation.variables?.fieldDefinitionId === field.id

                  return (
                    <div className='rounded-2xl bg-canvas-accent px-4 py-3' key={field.id}>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <p className='truncate text-sm font-medium text-text-strong'>{field.name}</p>
                            <Badge variant='subtle'>{fieldTypeLabels[field.fieldType]}</Badge>
                          </div>
                          <p className='mt-1 font-mono text-xs uppercase tracking-wide text-text-muted'>
                            Key: {field.key}
                          </p>
                          {field.options.length > 0 ? (
                            <div className='mt-2 flex flex-wrap gap-2'>
                              {field.options.map((option) => (
                                <Badge key={option.id} variant='count'>
                                  {option.label}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <Button
                          disabled={archivingThisField}
                          onClick={async () => {
                            if (!await confirm({title: `Archive the field "${field.name}"?`, confirmLabel: 'Archive'})) {
                              return
                            }

                            archiveFieldMutation.mutate({fieldDefinitionId: field.id})
                          }}
                          size='compact'
                          variant='ghost'
                        >
                          <Archive className='h-4 w-4'/>
                          Archive
                        </Button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className='rounded-2xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-muted'>
                  No active custom fields yet. Add the first one to extend the table and card detail views.
                </div>
              )}
            </div>
          </section>

          <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <PlusCircle className='h-4 w-4 text-text-muted'/>
              <h3 className='font-display text-lg font-semibold text-text-strong'>Create field</h3>
            </div>

            <div className='mt-4 space-y-4'>
              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Field name</span>
                <Input
                  onChange={(event) => setFieldName(event.target.value)}
                  placeholder='Launch date'
                  value={fieldName}
                />
              </label>

              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Field type</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) => setFieldType(event.target.value as CustomFieldType)}
                  value={fieldType}
                >
                  <option value='text'>Text</option>
                  <option value='number'>Number</option>
                  <option value='date'>Date</option>
                  <option value='single_select'>Single select</option>
                </select>
              </label>

              {fieldType === 'single_select' ? (
                <label className='space-y-2'>
                  <span className='text-sm font-medium text-text-strong'>Options</span>
                  <Textarea
                    className='min-h-[112px]'
                    onChange={(event) => setFieldOptionsText(event.target.value)}
                    placeholder={'Planned\nIn flight\nShipped'}
                    value={fieldOptionsText}
                  />
                  <p className='text-xs text-text-muted'>
                    Enter one option per line or separate them with commas.
                  </p>
                </label>
              ) : null}

              {errorMessage ? (
                <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error'>
                  {errorMessage}
                </div>
              ) : null}

              <div className='flex justify-end gap-2'>
                <Button onClick={onClose} variant='ghost'>
                  Close
                </Button>
                <Button disabled={createDisabled} onClick={handleCreate} variant='primary'>
                  <PlusCircle className='h-4 w-4'/>
                  {createFieldMutation.isPending ? 'Creating…' : 'Create field'}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </Dialog>
  )
}
