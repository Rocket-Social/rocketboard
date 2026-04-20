export type BoardCardTagLayout = {
  hiddenCount: number
  visibleTags: Array<{
    label: string
    maxWidth?: number
    truncated: boolean
  }>
}

type FitBoardCardTagsInput = {
  availableWidth: number
  measureText: (text: string) => number
  tags: string[]
}

const TAG_GAP_PX = 4
const TAG_HORIZONTAL_PADDING_PX = 12
const TAG_TRUNCATION_PREVIEW_CHARS = 3

function getSummaryWidth(count: number, measureText: (text: string) => number) {
  return Math.ceil(measureText(`+${count}`))
}

function getTagWidth(label: string, measureText: (text: string) => number) {
  return Math.ceil(measureText(label) + TAG_HORIZONTAL_PADDING_PX)
}

function getTruncatedTagMinWidth(label: string, measureText: (text: string) => number) {
  if (label.length <= TAG_TRUNCATION_PREVIEW_CHARS) {
    return getTagWidth(label, measureText)
  }

  return getTagWidth(`${label.slice(0, TAG_TRUNCATION_PREVIEW_CHARS)}\u2026`, measureText)
}

function getWidthForFullTags(fullTagWidths: number[], count: number) {
  if (count <= 0) {
    return 0
  }

  return fullTagWidths.slice(0, count).reduce((sum, width) => sum + width, 0) + (count - 1) * TAG_GAP_PX
}

export function fitBoardCardTags({
  availableWidth,
  measureText,
  tags,
}: FitBoardCardTagsInput): BoardCardTagLayout {
  if (tags.length === 0) {
    return {hiddenCount: 0, visibleTags: []}
  }

  const clampedWidth = Math.max(0, availableWidth)
  const fullTagWidths = tags.map((tag) => getTagWidth(tag, measureText))
  let fullTagCount = 0

  for (let count = 1; count <= tags.length; count += 1) {
    const hiddenCount = tags.length - count
    const widthWithSummary = getWidthForFullTags(fullTagWidths, count)
      + (hiddenCount > 0 ? TAG_GAP_PX + getSummaryWidth(hiddenCount, measureText) : 0)

    if (widthWithSummary <= clampedWidth) {
      fullTagCount = count
    }
  }

  if (fullTagCount === tags.length) {
    return {
      hiddenCount: 0,
      visibleTags: tags.map((label) => ({label, truncated: false})),
    }
  }

  const nextTagIndex = fullTagCount
  const hiddenCountAfterTruncation = tags.length - nextTagIndex - 1
  const widthBeforeTruncatedTag = getWidthForFullTags(fullTagWidths, fullTagCount)
    + (nextTagIndex > 0 ? TAG_GAP_PX : 0)
  const widthReservedForSummary = hiddenCountAfterTruncation > 0
    ? TAG_GAP_PX + getSummaryWidth(hiddenCountAfterTruncation, measureText)
    : 0
  const nextTagWidthBudget = clampedWidth - widthBeforeTruncatedTag - widthReservedForSummary
  const visibleTags: BoardCardTagLayout['visibleTags'] = tags
    .slice(0, fullTagCount)
    .map((label) => ({label, truncated: false}))

  if (nextTagWidthBudget >= getTruncatedTagMinWidth(tags[nextTagIndex], measureText)) {
    visibleTags.push({
      label: tags[nextTagIndex],
      maxWidth: Math.min(fullTagWidths[nextTagIndex], nextTagWidthBudget),
      truncated: true,
    })

    return {
      hiddenCount: hiddenCountAfterTruncation,
      visibleTags,
    }
  }

  return {
    hiddenCount: tags.length - fullTagCount,
    visibleTags,
  }
}
