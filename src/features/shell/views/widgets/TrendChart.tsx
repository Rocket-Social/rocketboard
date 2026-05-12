import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

export type TrendChartSeries = {
  color: string
  dashed?: boolean
  data: (number | null)[]
  fillOpacity?: number
  label: string
}

export type TrendChartPoint = {
  date: string
  isFuture: boolean
}

type TrendChartProps = {
  points: TrendChartPoint[]
  series: TrendChartSeries[]
  todayIndex: number
}

export function TrendChart({points, series, todayIndex}: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(440)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(Math.max(200, entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const svgW = containerWidth
  const svgH = Math.max(180, Math.round(containerWidth / 2.2))
  const padL = 40
  const padR = 16
  const padT = 20
  const padB = 40
  const chartW = svgW - padL - padR
  const chartH = svgH - padT - padB

  const maxY = useMemo(() => {
    let max = 1
    for (const s of series) {
      for (const v of s.data) {
        if (v !== null && v > max) max = v
      }
    }
    return max
  }, [series])

  const toX = useCallback((i: number) => padL + (i / Math.max(points.length - 1, 1)) * chartW, [chartW, padL, points.length])
  const toY = useCallback((v: number) => padT + chartH - (v / maxY) * chartH, [chartH, maxY, padT])

  const yTicks = useMemo(() => {
    const ticks: number[] = []
    const step = Math.max(1, Math.ceil(maxY / 5))
    for (let v = 0; v <= maxY; v += step) ticks.push(v)
    if (!ticks.includes(maxY)) ticks.push(maxY)
    return ticks
  }, [maxY])

  const todayX = todayIndex >= 0 ? toX(todayIndex) : null

  return (
    <div ref={containerRef} className='w-full'>
      <svg className='w-full' viewBox={`0 0 ${svgW} ${svgH}`}>
        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              stroke='var(--color-border-subtle)'
              strokeDasharray='4 4'
              x1={padL} x2={svgW - padR}
              y1={toY(v)} y2={toY(v)}
            />
            <text
              className='text-xs'
              dominantBaseline='middle'
              fill='var(--color-text-muted)'
              textAnchor='end'
              x={padL - 6} y={toY(v)}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Series */}
        {series.map((s) => {
          const validIndices = s.data.map((v, i) => v !== null ? i : -1).filter((i) => i >= 0)
          if (validIndices.length < 2) return null

          const line = validIndices.map((idx, j) =>
            `${j === 0 ? 'M' : 'L'}${toX(idx)},${toY(s.data[idx]!)}`,
          ).join(' ')

          const firstIdx = validIndices[0]
          const lastIdx = validIndices[validIndices.length - 1]
          const area = s.fillOpacity
            ? `${line} L${toX(lastIdx)},${toY(0)} L${toX(firstIdx)},${toY(0)} Z`
            : null

          return (
            <g key={s.label}>
              {area ? (
                <path d={area} fill={s.color} opacity={s.fillOpacity}/>
              ) : null}
              <path
                d={line}
                fill='none'
                stroke={s.color}
                strokeDasharray={s.dashed ? '6 4' : undefined}
                strokeWidth={s.dashed ? 1.5 : 2}
              />
              {!s.dashed ? validIndices.map((idx) => (
                <circle
                  cx={toX(idx)} cy={toY(s.data[idx]!)}
                  fill={s.color} key={idx} r={2.5}
                />
              )) : null}
            </g>
          )
        })}

        {/* Today line */}
        {todayX !== null ? (
          <line
            stroke='var(--color-primary)'
            strokeDasharray='4 3'
            strokeWidth={1}
            x1={todayX} x2={todayX}
            y1={padT} y2={padT + chartH}
          />
        ) : null}

        {/* X-axis labels — show at most ~8 to avoid overlap */}
        {points.map((p, i) => {
          const step = Math.max(1, Math.floor(points.length / 8))
          if (i % step !== 0 && i !== points.length - 1) return null
          return (
            <text
              className='text-xs'
              dominantBaseline='hanging'
              fill={p.isFuture ? 'var(--color-border-subtle)' : 'var(--color-text-muted)'}
              key={i}
              textAnchor='middle'
              x={toX(i)} y={svgH - padB + 8}
            >
              {p.date}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
