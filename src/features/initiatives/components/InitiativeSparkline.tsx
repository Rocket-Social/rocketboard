import type {InitiativeSparklinePoint} from '../initiative.types'

type InitiativeSparklineProps = {
  className?: string
  points: InitiativeSparklinePoint[]
}

export function InitiativeSparkline({className = '', points}: InitiativeSparklineProps) {
  if (points.length === 0) return null

  const maxScope = Math.max(...points.map((p) => p.totalScope), 1)
  const width = 100
  const height = 24
  const padX = 1
  const padY = 2

  const plotW = width - padX * 2
  const plotH = height - padY * 2

  // Build polyline coordinates
  const linePoints = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * plotW
    const y = padY + plotH - (p.cardsCompletedCumulative / maxScope) * plotH
    return `${x},${y}`
  })

  // Build fill polygon (same line + bottom-right + bottom-left)
  const fillPoints = [
    ...linePoints,
    `${padX + plotW},${padY + plotH}`,
    `${padX},${padY + plotH}`,
  ]

  return (
    <svg
      aria-label={`14-day trend: ${points[0].cardsCompletedCumulative} to ${points[points.length - 1].cardsCompletedCumulative} of ${points[points.length - 1].totalScope} complete`}
      className={className}
      preserveAspectRatio='none'
      role='img'
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon
        fill='var(--color-success)'
        opacity={0.1}
        points={fillPoints.join(' ')}
      />
      <polyline
        fill='none'
        points={linePoints.join(' ')}
        stroke='var(--color-success)'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={1.5}
      />
    </svg>
  )
}
