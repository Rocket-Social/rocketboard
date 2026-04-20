type GitHubSparklineProps = {
  points: Array<number | null>
}

export function GitHubSparkline({points}: GitHubSparklineProps) {
  const validPoints = points
    .map((value, index) => ({index, value}))
    .filter((point): point is {index: number; value: number} => point.value !== null)

  if (validPoints.length < 2) {
    return (
      <svg className="h-10 w-full text-border-subtle" preserveAspectRatio="none" viewBox="0 0 120 40">
        <path d="M6 24 H114" fill="none" opacity="0.5" stroke="currentColor" strokeDasharray="4 4" strokeWidth="2" />
      </svg>
    )
  }

  const values = validPoints.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const yRange = Math.max(maxValue - minValue, 1)

  const toX = (index: number) => 6 + (index / Math.max(points.length - 1, 1)) * 108
  const toY = (value: number) => 34 - ((value - minValue) / yRange) * 24

  const path = validPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.index)},${toY(point.value)}`)
    .join(' ')

  return (
    <svg className="h-10 w-full text-[#335c8f]" preserveAspectRatio="none" viewBox="0 0 120 40">
      <path d="M6 34 H114" fill="none" opacity="0.2" stroke="currentColor" strokeWidth="1" />
      <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  )
}
