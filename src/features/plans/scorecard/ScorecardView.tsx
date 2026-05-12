import {useQuery} from '@tanstack/react-query'
import {ChevronDown, ChevronRight, Plus, Target, Trash2} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {Input} from '../../../components/ui/input'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {
  planReleasesQueryOptions,
  planScorecardQueryOptions,
  roadmapDataQueryOptions,
  useCreateScorecardItemMutation,
  useDeleteScorecardItemMutation,
  useUpdatePlanViewConfigMutation,
  useUpdateScorecardItemMutation,
} from '../plan.queries'
import {
  defaultScorecardViewConfig,
  scorecardFrameworkPresets,
  type ScorecardDimension,
  type ScorecardFormulaType,
  type ScorecardFramework,
  type ScorecardItem,
  type ScorecardViewConfig,
  type UpdateScorecardItemInput,
} from '../plan.types'

// ── Scoring helpers ──────────────────────────────────────────

function computeComposite(
  scores: Record<string, number>,
  dimensions: ScorecardDimension[],
  formulaType: ScorecardFormulaType,
): number {
  const values = dimensions.map((d) => scores[d.key] ?? 0)
  if (values.length === 0 || values.some((v) => v === 0)) return 0

  switch (formulaType) {
    case 'multiply':
      return values.reduce((acc, v) => acc * v, 1)
    case 'divide_last': {
      if (values.length < 2) return values[0] ?? 0
      const numerator = values.slice(0, -1).reduce((acc, v) => acc * v, 1)
      return Math.round((numerator / values[values.length - 1]) * 10) / 10
    }
    case 'weighted_sum':
      return values.reduce((acc, v) => acc + v, 0)
  }
}

function isScored(scores: Record<string, number>, dimensions: ScorecardDimension[]): boolean {
  return dimensions.some((d) => (scores[d.key] ?? 0) > 0)
}

function getScoreTier(rank: number, total: number): 'low' | 'mid' | 'top' {
  if (total <= 1) return 'top'
  const percentile = rank / total
  if (percentile <= 0.25) return 'top'
  if (percentile <= 0.75) return 'mid'
  return 'low'
}

function getFormulaDisplay(config: ScorecardViewConfig): string {
  const keys = config.dimensions.map((d) => d.label.charAt(0))
  switch (config.formulaType) {
    case 'multiply':
      return keys.join(' × ')
    case 'divide_last':
      return keys.length > 1
        ? `${keys.slice(0, -1).join(' × ')} / ${keys[keys.length - 1]}`
        : keys[0] ?? ''
    case 'weighted_sum':
      return keys.join(' + ')
  }
}

const frameworkLabels: Record<ScorecardFramework, string> = {
  custom: 'Custom',
  ice: 'ICE',
  rice: 'RICE',
  wsjf: 'WSJF',
}

const badgeStyles = {
  low: 'bg-canvas-accent text-text-muted',
  mid: 'bg-secondary text-white',
  top: 'bg-success text-white',
} as const

// ── Score bar component ──────────────────────────────────────

function ScoreBar({max, value}: {max: number; value: number}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className='flex items-center gap-2'>
      <div className='h-1.5 w-12 rounded-full bg-secondary/20'>
        <div
          className='h-1.5 rounded-full bg-secondary transition-[width] duration-[120ms]'
          style={{width: `${pct}%`}}
        />
      </div>
      <span className='font-mono text-sm text-text-medium'>{value || '—'}</span>
    </div>
  )
}

// ── Inline number editor ─────────────────────────────────────

function ScoreCell({
  dimKey,
  max,
  min,
  onSave,
  value,
}: {
  dimKey: string
  max: number
  min: number
  onSave: (key: string, value: number) => void
  value: number
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (!editing) {
    return (
      <button
        className='flex w-full items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-canvas-accent'
        onClick={() => setEditing(true)}
        type='button'
      >
        <ScoreBar max={max} value={value}/>
      </button>
    )
  }

  const commit = () => {
    const parsed = parseInt(draft, 10)
    const clamped = Number.isNaN(parsed) ? value : Math.max(min, Math.min(max, parsed))
    setEditing(false)
    if (clamped !== value) {
      onSave(dimKey, clamped)
    }
    setDraft(String(clamped))
  }

  return (
    <input
      className='h-8 w-16 rounded-lg border border-primary bg-surface-base px-2 font-mono text-sm text-text-strong outline-none'
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Tab') {
          commit()
        }
        if (e.key === 'Escape') {
          setEditing(false)
          setDraft(String(value))
        }
      }}
      placeholder={`${min}–${max}`}
      ref={inputRef}
      type='number'
      value={draft}
    />
  )
}

// ── Expanded row panel ───────────────────────────────────────

function ExpandPanel({
  item,
  onUpdate,
  releaseOptions,
  roadmapOptions,
}: {
  item: ScorecardItem
  onUpdate: (input: UpdateScorecardItemInput) => void
  releaseOptions: Array<{id: string; label: string}>
  roadmapOptions: Array<{id: string; label: string}>
}) {
  const [activeTab, setActiveTab] = useState<'description' | 'links'>('description')
  const [desc, setDesc] = useState(item.description ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDesc(item.description ?? '')
  }, [item.description])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleDescChange = useCallback((value: string) => {
    setDesc(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const normalized = value.trim() || null
      if (normalized !== (item.description ?? null)) {
        onUpdate({description: normalized, itemId: item.id})
      }
    }, 500)
  }, [item.description, item.id, onUpdate])

  return (
    <div className='border-t border-border-subtle bg-surface-muted px-6 py-4'>
      <div className='mb-3 flex gap-1'>
        {(['description', 'links'] as const).map((tab) => (
          <button
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'bg-surface-elevated text-text-strong shadow-sm'
                : 'text-text-muted hover:text-text-medium'
            }`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type='button'
          >
            {tab === 'description' ? 'Description' : 'Links'}
          </button>
        ))}
      </div>

      {activeTab === 'description' ? (
        <textarea
          className='min-h-[80px] w-full rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-medium outline-none transition-colors focus:border-primary'
          onChange={(e) => handleDescChange(e.target.value)}
          placeholder='Why does this matter? What context supports the scores?'
          value={desc}
        />
      ) : (
        <div className='space-y-3'>
          <div>
            <span className='font-mono text-[10px] uppercase tracking-wider text-text-muted'>Release</span>
            <select
              className='mt-1 h-9 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none focus:border-primary'
              onChange={(e) => onUpdate({itemId: item.id, linkedReleaseId: e.target.value || null})}
              value={item.linkedReleaseId ?? ''}
            >
              <option value=''>None</option>
              {releaseOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <span className='font-mono text-[10px] uppercase tracking-wider text-text-muted'>Roadmap item</span>
            <select
              className='mt-1 h-9 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none focus:border-primary'
              onChange={(e) => onUpdate({itemId: item.id, linkedRoadmapItemId: e.target.value || null})}
              value={item.linkedRoadmapItemId ?? ''}
            >
              <option value=''>None</option>
              {roadmapOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

function parseScorecardConfig(raw: Record<string, unknown> | null | undefined): ScorecardViewConfig {
  if (!raw) return defaultScorecardViewConfig
  const framework = typeof raw.framework === 'string' && raw.framework in scorecardFrameworkPresets
    ? raw.framework as ScorecardFramework
    : defaultScorecardViewConfig.framework
  const preset = scorecardFrameworkPresets[framework]
  return {
    dimensions: Array.isArray(raw.dimensions) ? raw.dimensions as ScorecardDimension[] : preset.dimensions,
    formulaType: typeof raw.formulaType === 'string' ? raw.formulaType as ScorecardFormulaType : preset.formulaType,
    framework,
    sortMode: raw.sortMode === 'manual' ? 'manual' : 'auto',
  }
}

type ScorecardViewProps = {
  initialConfig?: Record<string, unknown> | null
  planViewId: string
  releaseViewId?: string
  roadmapViewId?: string
}

export function ScorecardView({initialConfig, planViewId, releaseViewId, roadmapViewId}: ScorecardViewProps) {
  const scorecardQuery = useQuery(planScorecardQueryOptions(planViewId))
  const releasesQuery = useQuery(planReleasesQueryOptions(releaseViewId ?? ''))
  const roadmapQuery = useQuery(roadmapDataQueryOptions(roadmapViewId ?? ''))
  const createMutation = useCreateScorecardItemMutation(planViewId)
  const updateMutation = useUpdateScorecardItemMutation(planViewId)
  const deleteMutation = useDeleteScorecardItemMutation(planViewId)
  const configMutation = useUpdatePlanViewConfigMutation()
  const {toast} = useToast()

  const [config, setConfig] = useState<ScorecardViewConfig>(() => parseScorecardConfig(initialConfig))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [nameValue, setNameValue] = useState('')

  const items = scorecardQuery.data ?? []

  const sortedItems = useMemo(() => {
    const scored = items
      .filter((item) => isScored(item.scores, config.dimensions))
      .map((item) => ({
        ...item,
        compositeScore: computeComposite(item.scores, config.dimensions, config.formulaType),
      }))
    const unscored = items.filter((item) => !isScored(item.scores, config.dimensions))

    if (config.sortMode === 'auto') {
      scored.sort((a, b) => b.compositeScore - a.compositeScore || a.position - b.position)
    } else {
      scored.sort((a, b) => a.position - b.position)
    }
    unscored.sort((a, b) => a.position - b.position)

    return {scored, unscored}
  }, [items, config])

  const summary = useMemo(() => {
    const scored = sortedItems.scored
    const scores = scored.map((s) => s.compositeScore).filter((s) => s > 0)
    return {
      avg: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      max: scores.length > 0 ? Math.max(...scores) : 0,
      min: scores.length > 0 ? Math.min(...scores) : 0,
      total: items.length,
      tracked: items.filter((i) => i.tracked).length,
    }
  }, [items, sortedItems.scored])

  const releaseOptions = useMemo(() =>
    (releasesQuery.data ?? []).map((r) => ({id: r.id, label: r.name})),
    [releasesQuery.data],
  )

  const roadmapOptions = useMemo(() =>
    (roadmapQuery.data?.items ?? []).map((i) => ({id: i.id, label: i.label})),
    [roadmapQuery.data?.items],
  )

  const handleUpdate = useCallback(async (input: UpdateScorecardItemInput) => {
    try {
      await updateMutation.mutateAsync(input)
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Couldn\'t save', variant: 'error'})
    }
  }, [updateMutation, toast])

  const handleScoreChange = useCallback((itemId: string, dimKey: string, value: number, currentScores: Record<string, number>) => {
    const nextScores = {...currentScores, [dimKey]: value}
    const composite = computeComposite(nextScores, config.dimensions, config.formulaType)
    void handleUpdate({compositeScore: composite, itemId, scores: nextScores})
  }, [config.dimensions, config.formulaType, handleUpdate])

  const handleCreate = useCallback(async () => {
    try {
      await createMutation.mutateAsync({planViewId, title: 'Untitled item'})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Couldn\'t create item', variant: 'error'})
    }
  }, [createMutation, planViewId, toast])

  const handleDelete = useCallback(async (item: ScorecardItem) => {
    try {
      await deleteMutation.mutateAsync(item.id)
      toast({description: `"${item.title}" deleted`, title: 'Item deleted', variant: 'default'})
    } catch (error) {
      toast({description: getErrorMessage(error), title: 'Couldn\'t delete', variant: 'error'})
    }
  }, [deleteMutation, toast])

  const handleFrameworkSwitch = useCallback(async (framework: ScorecardFramework) => {
    const preset = scorecardFrameworkPresets[framework]
    const nextConfig: ScorecardViewConfig = {...config, ...preset}
    setConfig(nextConfig)
    try {
      await configMutation.mutateAsync({config: nextConfig, viewId: planViewId})
    } catch (error) {
      setConfig(config)
      toast({description: getErrorMessage(error), title: 'Couldn\'t switch framework', variant: 'error'})
    }
  }, [config, configMutation, planViewId, toast])

  const commitName = useCallback((itemId: string, originalTitle: string) => {
    const trimmed = nameValue.trim()
    setEditingNameId(null)
    if (trimmed && trimmed !== originalTitle) {
      void handleUpdate({itemId, title: trimmed})
    }
  }, [nameValue, handleUpdate])

  // ── Loading ────────────────────────────────────────────────

  if (scorecardQuery.isPending) {
    return (
      <div className='space-y-3'>
        <div className='h-12 animate-pulse rounded-xl bg-border-subtle/30'/>
        {Array.from({length: 6}).map((_, i) => (
          <div className='h-11 animate-pulse rounded-lg bg-border-subtle/30' key={i}/>
        ))}
      </div>
    )
  }

  if (scorecardQuery.error) {
    return (
      <div className='rounded-2xl border border-error/20 bg-error/5 p-6'>
        <p className='text-sm font-medium text-text-strong'>Couldn't load scorecard</p>
        <p className='mt-1 text-sm text-text-medium'>{getErrorMessage(scorecardQuery.error)}</p>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <FrameworkSelector config={config} onSwitch={handleFrameworkSwitch}/>
        </div>
        <div className='rounded-2xl border border-dashed border-border-subtle px-6 py-16 text-center'>
          <p className='font-mono text-lg text-text-muted'>{getFormulaDisplay(config)}</p>
          <h3 className='mt-3 font-display text-lg font-semibold text-text-strong'>Score what to build next</h3>
          <p className='mx-auto mt-2 max-w-md text-sm text-text-medium'>
            Rate each item on {config.dimensions.map((d) => d.label).join(', ')} (1–10).
            The composite score ranks your priorities automatically.
          </p>
          <div className='mt-6'>
            <Button onClick={handleCreate} variant='primary'>
              <Plus className='h-4 w-4'/>
              Add first item
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Table view ─────────────────────────────────────────────

  const scoredTotal = sortedItems.scored.length

  return (
    <div className='space-y-3 pb-10'>
      {/* Toolbar */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FrameworkSelector config={config} onSwitch={handleFrameworkSwitch}/>
        <Button disabled={createMutation.isPending} onClick={handleCreate} variant='primary'>
          <Plus className='h-4 w-4'/>
          {createMutation.isPending ? 'Adding…' : 'Add item'}
        </Button>
      </div>

      {/* Summary strip */}
      <div className='font-mono text-xs text-text-muted'>
        <span>{summary.total} items</span>
        <span className='mx-2'>·</span>
        <span className={summary.tracked > 0 ? 'text-primary' : ''}>{summary.tracked} tracked</span>
        <span className='mx-2'>·</span>
        <span>avg score: {summary.avg || '—'}</span>
        {summary.min !== summary.max ? (
          <>
            <span className='mx-2'>·</span>
            <span>range: {summary.min}–{summary.max}</span>
          </>
        ) : null}
      </div>

      {/* Table */}
      <div className='overflow-x-auto rounded-xl border border-border-subtle bg-surface-elevated shadow-sm'>
        <table className='w-full' role='grid' aria-label='Scorecard'>
          <thead>
            <tr className='border-b border-border-subtle bg-surface-muted'>
              <th className='w-10 px-3 py-2.5 text-left font-mono text-xs uppercase tracking-wider text-text-muted'>#</th>
              <th className='min-w-[200px] px-3 py-2.5 text-left font-mono text-xs uppercase tracking-wider text-text-muted'>Name</th>
              <th className='w-12 px-3 py-2.5 text-center font-mono text-xs uppercase tracking-wider text-text-muted'>
                <Target className='mx-auto h-3.5 w-3.5'/>
              </th>
              {config.dimensions.map((dim) => (
                <th className='w-20 px-3 py-2.5 text-left font-mono text-xs uppercase tracking-wider text-text-muted' key={dim.key}>
                  {dim.label}
                </th>
              ))}
              <th className='w-24 px-3 py-2.5 text-left font-mono text-xs uppercase tracking-wider text-text-muted'>Score</th>
              <th className='w-10 px-3 py-2.5'/>
            </tr>
          </thead>
          <tbody>
            {sortedItems.scored.map((item, index) => {
              const tier = getScoreTier(index, scoredTotal)
              const expanded = expandedId === item.id
              return (
                <ScorecardTableRow
                  commitName={commitName}
                  config={config}
                  editingNameId={editingNameId}
                  expanded={expanded}
                  handleDelete={handleDelete}
                  handleScoreChange={handleScoreChange}
                  handleUpdate={handleUpdate}
                  item={item}
                  key={item.id}
                  nameValue={nameValue}
                  rank={index + 1}
                  releaseOptions={releaseOptions}
                  roadmapOptions={roadmapOptions}
                  setEditingNameId={setEditingNameId}
                  setExpandedId={setExpandedId}
                  setNameValue={setNameValue}
                  tier={tier}
                />
              )
            })}
            {sortedItems.unscored.length > 0 ? (
              <>
                <tr className='border-t-2 border-border-subtle'>
                  <td className='px-3 py-2 font-mono text-xs italic text-text-muted' colSpan={config.dimensions.length + 5}>
                    Needs scoring
                  </td>
                </tr>
                {sortedItems.unscored.map((item) => {
                  const expanded = expandedId === item.id
                  return (
                    <ScorecardTableRow
                      commitName={commitName}
                      config={config}
                      editingNameId={editingNameId}
                      expanded={expanded}
                      handleDelete={handleDelete}
                      handleScoreChange={handleScoreChange}
                      handleUpdate={handleUpdate}
                      item={{...item, compositeScore: 0}}
                      key={item.id}
                      nameValue={nameValue}
                      releaseOptions={releaseOptions}
                      roadmapOptions={roadmapOptions}
                      setEditingNameId={setEditingNameId}
                      setExpandedId={setExpandedId}
                      setNameValue={setNameValue}
                      tier={null}
                    />
                  )
                })}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Table row ────────────────────────────────────────────────

function ScorecardTableRow({
  commitName,
  config,
  editingNameId,
  expanded,
  handleDelete,
  handleScoreChange,
  handleUpdate,
  item,
  nameValue,
  rank,
  releaseOptions,
  roadmapOptions,
  setEditingNameId,
  setExpandedId,
  setNameValue,
  tier,
}: {
  commitName: (id: string, original: string) => void
  config: ScorecardViewConfig
  editingNameId: string | null
  expanded: boolean
  handleDelete: (item: ScorecardItem) => void
  handleScoreChange: (itemId: string, dimKey: string, value: number, scores: Record<string, number>) => void
  handleUpdate: (input: UpdateScorecardItemInput) => void
  item: ScorecardItem & {compositeScore: number}
  nameValue: string
  rank?: number
  releaseOptions: Array<{id: string; label: string}>
  roadmapOptions: Array<{id: string; label: string}>
  setEditingNameId: (id: string | null) => void
  setExpandedId: (id: string | null) => void
  setNameValue: (v: string) => void
  tier: 'low' | 'mid' | 'top' | null
}) {
  const isEditing = editingNameId === item.id

  return (
    <>
      <tr
        className={`group border-b border-border-subtle transition-colors hover:bg-canvas-accent ${
          item.tracked ? 'border-l-2 border-l-primary' : ''
        }`}
        role='row'
      >
        {/* Rank */}
        <td className='px-3 py-2 font-mono text-xs text-text-muted'>
          {rank ?? '—'}
        </td>

        {/* Name */}
        <td className='px-3 py-2'>
          {isEditing ? (
            <Input
              autoFocus
              className='h-8 text-sm font-medium'
              onBlur={() => commitName(item.id, item.title)}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName(item.id, item.title)
                if (e.key === 'Escape') setEditingNameId(null)
              }}
              value={nameValue}
            />
          ) : (
            <button
              className='text-left text-sm font-medium text-text-strong hover:underline'
              onClick={() => {
                setEditingNameId(item.id)
                setNameValue(item.title)
              }}
              type='button'
            >
              {item.title}
            </button>
          )}
        </td>

        {/* Tracked */}
        <td className='px-3 py-2 text-center'>
          <button
            aria-checked={item.tracked}
            className={`transition-colors ${item.tracked ? 'text-primary' : 'text-text-muted hover:text-text-medium'}`}
            onClick={() => handleUpdate({itemId: item.id, tracked: !item.tracked})}
            role='switch'
            type='button'
          >
            <Target className='h-4 w-4' fill={item.tracked ? 'currentColor' : 'none'}/>
          </button>
        </td>

        {/* Score dimensions */}
        {config.dimensions.map((dim) => (
          <td className='px-3 py-2' key={dim.key}>
            <ScoreCell
              dimKey={dim.key}
              max={dim.scale[1]}
              min={dim.scale[0]}
              onSave={(key, value) => handleScoreChange(item.id, key, value, item.scores)}
              value={item.scores[dim.key] ?? 0}
            />
          </td>
        ))}

        {/* Composite */}
        <td className='px-3 py-2'>
          {tier ? (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${badgeStyles[tier]}`}>
              {item.compositeScore}
            </span>
          ) : (
            <span className='font-mono text-xs italic text-text-muted'>—</span>
          )}
        </td>

        {/* Actions */}
        <td className='px-3 py-2'>
          <div className='flex items-center gap-1'>
            <button
              className='rounded p-1 text-text-muted transition-colors hover:text-text-strong'
              onClick={() => setExpandedId(expanded ? null : item.id)}
              type='button'
            >
              {expanded ? <ChevronDown className='h-4 w-4'/> : <ChevronRight className='h-4 w-4'/>}
            </button>
            <button
              className='rounded p-1 text-text-muted opacity-0 transition-all hover:text-error group-hover:opacity-100'
              onClick={() => handleDelete(item)}
              type='button'
            >
              <Trash2 className='h-3.5 w-3.5'/>
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded panel */}
      {expanded ? (
        <tr>
          <td colSpan={config.dimensions.length + 5}>
            <ExpandPanel
              item={item}
              onUpdate={handleUpdate}
              releaseOptions={releaseOptions}
              roadmapOptions={roadmapOptions}
            />
          </td>
        </tr>
      ) : null}
    </>
  )
}

// ── Framework selector ───────────────────────────────────────

function FrameworkSelector({
  config,
  onSwitch,
}: {
  config: ScorecardViewConfig
  onSwitch: (framework: ScorecardFramework) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-3 py-1.5 text-sm font-medium text-text-strong transition-colors hover:bg-canvas-accent'
          type='button'
        >
          {frameworkLabels[config.framework]} Scoring
          <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        {(Object.keys(frameworkLabels) as ScorecardFramework[]).map((fw) => (
          <DropdownMenuItem
            key={fw}
            onClick={() => onSwitch(fw)}
          >
            <span className={config.framework === fw ? 'font-medium text-primary' : ''}>
              {frameworkLabels[fw]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
