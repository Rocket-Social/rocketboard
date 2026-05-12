export const GRANOLA_PROVIDER = 'granola' as const
export const GRANOLA_IMPORT_FORMAT_VERSION = 2 as const

export type NoteImportProvider = typeof GRANOLA_PROVIDER

export type GranolaConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'needs_reconnect'

export type GranolaSyncMode = 'backfill' | 'incremental'

export type GranolaConnectionMode = 'mirror' | 'capture'
export type GranolaAuthMethod = 'api_key' | 'oauth'

export type GranolaConnectionRecord = {
  authMethod: GranolaAuthMethod
  backfillCursor: string | null
  createdAt: string
  id: string
  initialImportCompletedAt: string | null
  lastSourceUpdatedAt: string | null
  lastSyncError: string | null
  lastSyncFinishedAt: string | null
  lastSyncStartedAt: string | null
  mode: GranolaConnectionMode
  provider: NoteImportProvider
  rootFolderId: string | null
  status: GranolaConnectionStatus
  updatedAt: string
  userId: string
}

export type GranolaListNote = {
  created_at: string
  id: string
  object: 'note'
  owner: {
    email: string
    name: string
  }
  title: string | null
  updated_at: string
}

export type GranolaTranscriptEntry = {
  end_time: string | null
  speaker: {
    source?: string | null
  } | null
  start_time: string | null
  text: string
}

export type GranolaNoteDetail = {
  attendees: Array<{
    email: string | null
    name: string | null
  }>
  calendar_event: {
    calendar_event_id: string | null
    event_title: string | null
    invitees: Array<{email: string | null}>
    organiser: string | null
    scheduled_end_time: string | null
    scheduled_start_time: string | null
  } | null
  created_at: string
  folder_membership: Array<{
    id: string
    name: string
    object: 'folder'
  }>
  id: string
  object: 'note'
  owner: {
    email: string
    name: string
  }
  summary_markdown: string | null
  summary_text: string
  title: string | null
  transcript: GranolaTranscriptEntry[] | null
  updated_at: string
}

type RichTextMark = {
  attrs?: Record<string, unknown>
  type: string
}

type RichTextNode = {
  attrs?: Record<string, unknown>
  content?: RichTextNode[]
  marks?: RichTextMark[]
  text?: string
  type: string
}

type RichTextDocumentLike = {
  content: RichTextNode[]
  type: 'doc'
}

export type GranolaImportedNoteContent = {
  contentJson: RichTextDocumentLike
  contentMd: string
  previewText: string
  sourceMetadata: Record<string, unknown>
  title: string
}

export function getGranolaImportFormatVersion(sourceMetadata: unknown) {
  if (!sourceMetadata || typeof sourceMetadata !== 'object' || Array.isArray(sourceMetadata)) {
    return null
  }

  const value = (sourceMetadata as Record<string, unknown>).importVersion
  return typeof value === 'number' ? value : null
}

export function isCurrentGranolaImportVersion(sourceMetadata: unknown) {
  return getGranolaImportFormatVersion(sourceMetadata) === GRANOLA_IMPORT_FORMAT_VERSION
}

export function shouldRefreshGranolaImportedNote(params: {
  localSourceUpdatedAt: string | null | undefined
  remoteSourceUpdatedAt: string | null | undefined
  sourceMetadata: unknown
}) {
  if (!isCurrentGranolaImportVersion(params.sourceMetadata)) {
    return true
  }

  const localTimestamp = Date.parse(params.localSourceUpdatedAt ?? '')
  const remoteTimestamp = Date.parse(params.remoteSourceUpdatedAt ?? '')

  if (Number.isNaN(localTimestamp) || Number.isNaN(remoteTimestamp)) {
    return true
  }

  return localTimestamp < remoteTimestamp
}

function normalizeLineBreaks(value: string | null | undefined) {
  return (value ?? '').replace(/\r\n/g, '\n')
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function stripGranolaMarkdown(value: string | null | undefined) {
  return collapseWhitespace(
    normalizeLineBreaks(value)
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^>\s+/gm, '')
      .replace(/^- \[[ x]\]\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, ''),
  )
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return value.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...'
}

function extractFirstMeaningfulLine(value: string | null | undefined) {
  const lines = normalizeLineBreaks(value)
    .split('\n')
    .map((line) => stripGranolaMarkdown(line))
    .filter(Boolean)

  return lines[0] ?? ''
}

function makeTextNode(text: string, marks?: RichTextMark[]): RichTextNode {
  return {marks, text, type: 'text'}
}

function makeParagraphNode(text: string): RichTextNode {
  const normalizedText = collapseWhitespace(text)

  if (!normalizedText) {
    return {type: 'paragraph'}
  }

  return {
    content: [makeTextNode(normalizedText)],
    type: 'paragraph',
  }
}

function makeLabeledParagraphNode(label: string, value: string): RichTextNode {
  const normalizedValue = collapseWhitespace(value)

  if (!normalizedValue) {
    return makeParagraphNode(label)
  }

  return {
    content: [
      makeTextNode(`${label}: `, [{type: 'bold'}]),
      makeTextNode(normalizedValue),
    ],
    type: 'paragraph',
  }
}

function makeHeadingNode(text: string, level = 2): RichTextNode {
  return {
    attrs: {level},
    content: [makeTextNode(collapseWhitespace(text))],
    type: 'heading',
  }
}

function makeBulletListNode(items: string[]): RichTextNode {
  return {
    content: items.map((item) => ({
      content: [makeParagraphNode(item)],
      type: 'listItem',
    })),
    type: 'bulletList',
  }
}

function flushParagraphBuffer(buffer: string[], nodes: RichTextNode[]) {
  if (buffer.length === 0) {
    return
  }

  nodes.push(makeParagraphNode(buffer.join(' ')))
  buffer.length = 0
}

function markdownToRichTextNodes(markdown: string | null | undefined): RichTextNode[] {
  const normalized = normalizeLineBreaks(markdown).trim()

  if (!normalized) {
    return []
  }

  const lines = normalized.split('\n')
  const nodes: RichTextNode[] = []
  const paragraphBuffer: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? ''
    const line = rawLine.trim()

    if (!line) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      nodes.push(
        makeHeadingNode(
          stripGranolaMarkdown(headingMatch[2] ?? ''),
          Math.min(4, headingMatch[1]?.length ?? 2),
        ),
      )
      continue
    }

    const bulletMatch = line.match(/^[-*+]\s+(.*)$/)
    if (bulletMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      const items = [stripGranolaMarkdown(bulletMatch[1] ?? '')]

      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1]?.trim() ?? ''
        const nextMatch = nextLine.match(/^[-*+]\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        items.push(stripGranolaMarkdown(nextMatch[1] ?? ''))
        index += 1
      }

      nodes.push(makeBulletListNode(items.filter(Boolean)))
      continue
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/)
    if (orderedMatch) {
      flushParagraphBuffer(paragraphBuffer, nodes)
      const items = [stripGranolaMarkdown(orderedMatch[1] ?? '')]

      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1]?.trim() ?? ''
        const nextMatch = nextLine.match(/^\d+\.\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        items.push(stripGranolaMarkdown(nextMatch[1] ?? ''))
        index += 1
      }

      nodes.push({
        content: items.filter(Boolean).map((item) => ({
          content: [makeParagraphNode(item)],
          type: 'listItem',
        })),
        type: 'orderedList',
      })
      continue
    }

    paragraphBuffer.push(stripGranolaMarkdown(line))
  }

  flushParagraphBuffer(paragraphBuffer, nodes)
  return nodes
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatMeetingTimeRange(detail: GranolaNoteDetail) {
  const start = detail.calendar_event?.scheduled_start_time ?? detail.created_at
  const end = detail.calendar_event?.scheduled_end_time ?? null
  const startLabel = formatDateLabel(start)
  const endLabel = formatDateLabel(end)

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`
  }

  return startLabel || endLabel
}

function buildMeetingDetailsLines(detail: GranolaNoteDetail) {
  const lines: string[] = []
  const meetingTime = formatMeetingTimeRange(detail)
  if (meetingTime) {
    lines.push(`Meeting time: ${meetingTime}`)
  }

  const attendeeNames = detail.attendees
    .map((attendee) => {
      const name = attendee.name?.trim()
      const email = attendee.email?.trim()

      if (name && email) return `${name} (${email})`
      return name || email || ''
    })
    .filter(Boolean)

  if (attendeeNames.length > 0) {
    lines.push(`Attendees: ${attendeeNames.join(', ')}`)
  }

  const folderNames = detail.folder_membership
    .map((folder) => folder.name?.trim() ?? '')
    .filter(Boolean)

  if (folderNames.length > 0) {
    lines.push(`Granola folders: ${folderNames.join(', ')}`)
  }

  if (lines.length === 0) {
    lines.push('No meeting details available.')
  }

  return lines
}

function getGranolaSpeakerLabel(entry: GranolaTranscriptEntry, index: number) {
  const source = entry.speaker?.source?.trim().toLowerCase()

  if (source === 'microphone') {
    return 'You'
  }

  if (source === 'speaker') {
    return 'Speaker'
  }

  return `Speaker ${index + 1}`
}

function buildTranscriptParagraphs(detail: GranolaNoteDetail) {
  const transcript = detail.transcript ?? []

  if (transcript.length === 0) {
    return [makeParagraphNode('Transcript unavailable.')]
  }

  return transcript.map((entry, index) =>
    makeLabeledParagraphNode(getGranolaSpeakerLabel(entry, index), entry.text ?? ''),
  )
}

function buildTranscriptMarkdown(detail: GranolaNoteDetail) {
  const transcript = detail.transcript ?? []

  if (transcript.length === 0) {
    return 'Transcript unavailable.'
  }

  return transcript
    .map((entry, index) => `**${getGranolaSpeakerLabel(entry, index)}:** ${collapseWhitespace(entry.text ?? '')}`)
    .join('\n\n')
}

function buildSummaryNodes(detail: GranolaNoteDetail) {
  const fromMarkdown = markdownToRichTextNodes(detail.summary_markdown)
  if (fromMarkdown.length > 0) {
    return fromMarkdown
  }

  const fallbackSummary = collapseWhitespace(detail.summary_text)
  if (fallbackSummary) {
    return [makeParagraphNode(fallbackSummary)]
  }

  return [makeParagraphNode('No summary available.')]
}

function buildSummaryMarkdown(detail: GranolaNoteDetail) {
  const markdown = normalizeLineBreaks(detail.summary_markdown).trim()
  if (markdown) {
    return markdown
  }

  const fallbackSummary = collapseWhitespace(detail.summary_text)
  return fallbackSummary || 'No summary available.'
}

function pickGranolaTitle(detail: GranolaNoteDetail) {
  return detail.title?.trim()
    || detail.calendar_event?.event_title?.trim()
    || 'Granola note'
}

export function pickGranolaPrimaryFolderName(detail: Pick<GranolaNoteDetail, 'folder_membership'>) {
  return detail.folder_membership
    .map((folder) => folder.name?.trim() ?? '')
    .find(Boolean) ?? null
}

export function pickGranolaPreviewText(detail: GranolaNoteDetail) {
  const summaryPreview = extractFirstMeaningfulLine(detail.summary_text)
    || extractFirstMeaningfulLine(detail.summary_markdown)

  if (summaryPreview) {
    return truncate(summaryPreview, 180)
  }

  const transcriptPreview = extractFirstMeaningfulLine(detail.transcript?.[0]?.text ?? '')
  if (transcriptPreview) {
    return truncate(transcriptPreview, 180)
  }

  return pickGranolaTitle(detail)
}

export function buildGranolaImportedNote(detail: GranolaNoteDetail): GranolaImportedNoteContent {
  const title = pickGranolaTitle(detail)
  const previewText = pickGranolaPreviewText(detail)
  const meetingDetails = buildMeetingDetailsLines(detail)

  const contentJson: RichTextDocumentLike = {
    content: [
      makeParagraphNode(previewText),
      makeHeadingNode('Meeting details', 2),
      makeBulletListNode(meetingDetails),
      makeHeadingNode('Summary', 2),
      ...buildSummaryNodes(detail),
      makeHeadingNode('Transcript', 2),
      ...buildTranscriptParagraphs(detail),
    ],
    type: 'doc',
  }

  const contentMd = [
    previewText,
    '## Meeting details',
    ...meetingDetails.map((line) => `- ${line}`),
    '## Summary',
    buildSummaryMarkdown(detail),
    '## Transcript',
    buildTranscriptMarkdown(detail),
  ].join('\n\n')

  return {
    contentJson,
    contentMd,
    previewText,
    sourceMetadata: {
      attendeeEmails: detail.attendees.map((attendee) => attendee.email).filter(Boolean),
      attendeeNames: detail.attendees.map((attendee) => attendee.name).filter(Boolean),
      calendarEventId: detail.calendar_event?.calendar_event_id ?? null,
      folderNames: detail.folder_membership.map((folder) => folder.name),
      importVersion: GRANOLA_IMPORT_FORMAT_VERSION,
      ownerEmail: detail.owner.email,
      ownerName: detail.owner.name,
      scheduledEndTime: detail.calendar_event?.scheduled_end_time ?? null,
      scheduledStartTime: detail.calendar_event?.scheduled_start_time ?? null,
    },
    title,
  }
}

export function coerceGranolaConnectionStatus(value: string | null | undefined): GranolaConnectionStatus {
  if (
    value === 'connected'
    || value === 'disconnected'
    || value === 'error'
    || value === 'needs_reconnect'
  ) {
    return value
  }

  return 'disconnected'
}

export function isGranolaImportedNote(note: {sourceProvider?: string | null}) {
  return note.sourceProvider === GRANOLA_PROVIDER
}
