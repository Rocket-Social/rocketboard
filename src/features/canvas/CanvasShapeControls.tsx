import {Check, Search} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Input} from '../../components/ui/input'
import {cn} from '../../lib/cn'
import {
  CANVAS_SHAPE_COLORS,
  type CanvasShapeStrokeStyle,
  type CanvasShapeType,
} from './canvas.types'

const SHAPE_GRID_ICON_SIZE = 52

type CanvasShapeDefinition = {
  keywords: string[]
  label: string
  value: CanvasShapeType
}

export const CANVAS_SHAPE_DEFINITIONS: CanvasShapeDefinition[] = [
  {keywords: ['box', 'square'], label: 'Rectangle', value: 'rectangle'},
  {keywords: ['pill', 'rounded box'], label: 'Rounded rectangle', value: 'rounded-rectangle'},
  {keywords: ['ellipse', 'oval'], label: 'Circle', value: 'circle'},
  {keywords: ['rhombus'], label: 'Diamond', value: 'diamond'},
  {keywords: ['pyramid'], label: 'Triangle', value: 'triangle'},
  {keywords: ['polygon'], label: 'Hexagon', value: 'hexagon'},
  {keywords: ['slant'], label: 'Parallelogram', value: 'parallelogram'},
  {keywords: ['funnel'], label: 'Trapezoid', value: 'trapezoid'},
  {keywords: ['arrow'], label: 'Arrow', value: 'arrow-right'},
  {keywords: ['add', 'cross', 'fat'], label: 'Fat plus', value: 'plus'},
  {keywords: ['favorite', 'rating', 'spark'], label: 'Star', value: 'star'},
  {keywords: ['bubble', 'callout', 'speech', 'thought'], label: 'Thought bubble', value: 'thought-bubble'},
]

function getStrokeDasharray(strokeStyle: CanvasShapeStrokeStyle) {
  return strokeStyle === 'dashed' ? '8 5' : undefined
}

function getStarPoints(width: number, height: number) {
  const centerX = width / 2
  const centerY = height / 2
  const outerRadius = Math.max(1, Math.min(width, height) / 2 - 2)
  const innerRadius = outerRadius * 0.46

  return Array.from({length: 10}, (_point, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5
    const radius = index % 2 === 0 ? outerRadius : innerRadius

    return `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`
  }).join(' ')
}

function getThoughtBubblePath(width: number, height: number) {
  const inset = 2
  const left = inset
  const right = width - inset
  const top = height * 0.14
  const bottom = height * 0.72
  const tailBottom = height - inset * 2
  const radius = Math.min((right - left) * 0.22, (bottom - top) * 0.5)
  const tailBaseLeft = left + (right - left) * 0.28
  const tailBaseRight = left + (right - left) * 0.44
  const tailTipX = left + (right - left) * 0.24

  return [
    `M ${left + radius} ${top}`,
    `H ${right - radius}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `V ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `H ${tailBaseRight}`,
    `C ${tailBaseRight} ${bottom + (tailBottom - bottom) * 0.36} ${tailTipX} ${tailBottom} ${tailTipX} ${tailBottom}`,
    `C ${tailTipX + (tailBaseRight - tailTipX) * 0.06} ${bottom + (tailBottom - bottom) * 0.52} ${tailBaseLeft} ${bottom} ${tailBaseLeft} ${bottom}`,
    `H ${left + radius}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `V ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    'Z',
  ].join(' ')
}

function getShapePoints(shapeType: CanvasShapeType, width: number, height: number) {
  switch (shapeType) {
    case 'diamond':
      return `${width / 2},2 ${width - 2},${height / 2} ${width / 2},${height - 2} 2,${height / 2}`
    case 'triangle':
      return `${width / 2},2 ${width - 2},${height - 2} 2,${height - 2}`
    case 'hexagon':
      return `${width * 0.24},2 ${width * 0.76},2 ${width - 2},${height / 2} ${width * 0.76},${height - 2} ${width * 0.24},${height - 2} 2,${height / 2}`
    case 'parallelogram':
      return `${width * 0.18},2 ${width - 2},2 ${width * 0.82},${height - 2} 2,${height - 2}`
    case 'trapezoid':
      return `${width * 0.2},2 ${width * 0.8},2 ${width - 2},${height - 2} 2,${height - 2}`
    case 'arrow-right':
      return `2,${height * 0.22} ${width * 0.66},${height * 0.22} ${width * 0.66},2 ${width - 2},${height / 2} ${width * 0.66},${height - 2} ${width * 0.66},${height * 0.78} 2,${height * 0.78}`
    case 'plus':
      return `${width * 0.38},2 ${width * 0.62},2 ${width * 0.62},${height * 0.36} ${width - 2},${height * 0.36} ${width - 2},${height * 0.64} ${width * 0.62},${height * 0.64} ${width * 0.62},${height - 2} ${width * 0.38},${height - 2} ${width * 0.38},${height * 0.64} 2,${height * 0.64} 2,${height * 0.36} ${width * 0.38},${height * 0.36}`
    case 'star':
      return getStarPoints(width, height)
    default:
      return null
  }
}

export function CanvasShapeGlyph({
  className,
  fillColor = 'transparent',
  shapeType,
  strokeColor = 'currentColor',
  strokeStyle = 'solid',
  strokeWidth = 2,
}: {
  className?: string
  fillColor?: string
  shapeType: CanvasShapeType
  strokeColor?: string
  strokeStyle?: CanvasShapeStrokeStyle
  strokeWidth?: number
}) {
  const width = SHAPE_GRID_ICON_SIZE
  const height = SHAPE_GRID_ICON_SIZE
  const strokeDasharray = getStrokeDasharray(strokeStyle)
  const commonProps = {
    fill: fillColor,
    stroke: strokeStyle === 'none' ? 'none' : strokeColor,
    strokeDasharray,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  }
  const polygonPoints = getShapePoints(shapeType, width, height)
  const thoughtBubblePath = shapeType === 'thought-bubble' ? getThoughtBubblePath(width, height) : null

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`}>
      {shapeType === 'circle' ? (
        <ellipse
          {...commonProps}
          cx={width / 2}
          cy={height / 2}
          rx={width / 2 - strokeWidth}
          ry={height / 2 - strokeWidth}
        />
      ) : shapeType === 'rectangle' ? (
        <rect
          {...commonProps}
          height={height - strokeWidth * 2}
          rx={6}
          ry={6}
          width={width - strokeWidth * 2}
          x={strokeWidth}
          y={strokeWidth}
        />
      ) : shapeType === 'rounded-rectangle' ? (
        <rect
          {...commonProps}
          height={height - strokeWidth * 2}
          rx={16}
          ry={16}
          width={width - strokeWidth * 2}
          x={strokeWidth}
          y={strokeWidth}
        />
      ) : thoughtBubblePath ? (
        <path
          {...commonProps}
          d={thoughtBubblePath}
        />
      ) : polygonPoints ? (
        <polygon
          {...commonProps}
          points={polygonPoints}
        />
      ) : null}
    </svg>
  )
}

export function CanvasShapePickerGrid({
  onShapeTypeChange,
  searchable = false,
  selectedShapeType,
}: {
  onShapeTypeChange: (shapeType: CanvasShapeType) => void
  searchable?: boolean
  selectedShapeType: CanvasShapeType
}) {
  const [query, setQuery] = useState('')
  const shapes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return CANVAS_SHAPE_DEFINITIONS
    }

    return CANVAS_SHAPE_DEFINITIONS.filter((shape) =>
      shape.label.toLowerCase().includes(normalizedQuery)
      || shape.keywords.some((keyword) => keyword.includes(normalizedQuery)),
    )
  }, [query])

  return (
    <div className='w-[280px]'>
      {searchable ? (
        <div className='relative mb-3'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-inverse-muted'/>
          <Input
            className='h-10 rounded-xl border-white/10 bg-sidebar-soft pl-9 text-sm text-text-inverse placeholder:text-text-inverse-muted focus:border-primary'
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Search for a shape'
            value={query}
          />
        </div>
      ) : null}

      <div className='grid grid-cols-4 gap-2'>
        {shapes.map((shape) => {
          const isActive = selectedShapeType === shape.value

          return (
            <button
              aria-label={shape.label}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl border transition-colors',
                isActive
                  ? 'border-primary bg-primary text-white'
                  : 'border-white/10 bg-sidebar-soft text-text-inverse-muted hover:text-text-inverse',
              )}
              key={shape.value}
              onClick={() => onShapeTypeChange(shape.value)}
              title={shape.label}
              type='button'
            >
              <CanvasShapeGlyph
                className='h-7 w-7'
                shapeType={shape.value}
                strokeColor='currentColor'
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CanvasColorSwatchPalette({
  allowNone = false,
  noneLabel = 'No fill',
  onChange,
  selectedColor,
}: {
  allowNone?: boolean
  noneLabel?: string
  onChange: (color: string | null) => void
  selectedColor: string | null
}) {
  return (
    <div className='space-y-3'>
      {allowNone ? (
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            selectedColor === null
              ? 'border-primary bg-primary text-white'
              : 'border-white/10 bg-sidebar-soft text-text-inverse-muted hover:text-text-inverse',
          )}
          onClick={() => onChange(null)}
          type='button'
        >
          {selectedColor === null ? <Check className='h-3.5 w-3.5'/> : null}
          {noneLabel}
        </button>
      ) : null}

      <div className='flex max-w-[320px] flex-wrap gap-2'>
        {CANVAS_SHAPE_COLORS.map((color) => {
          const isActive = selectedColor === color

          return (
            <button
              aria-label={`Select color ${color}`}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-transform hover:scale-105',
                isActive ? 'border-primary' : 'border-white/15',
              )}
              key={color}
              onClick={() => onChange(color)}
              style={{backgroundColor: color}}
              type='button'
            />
          )
        })}
      </div>
    </div>
  )
}
