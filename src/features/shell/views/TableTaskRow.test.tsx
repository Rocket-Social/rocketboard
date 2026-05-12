// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {createRef} from 'react'
import {describe, expect, it, vi} from 'vitest'

import type {CardRecord} from '../../cards/card.types'
import type {ProjectTableTask} from '../../cards/card-view-mappers'
import {TableTaskRow, type TableTaskRowProps} from './TableTaskRow'

function createTask(id: string, title: string): ProjectTableTask {
  const card: CardRecord = {
    assigneeName: 'Alex Lane',
    assigneeUserId: 'user-1',
    bodyJson: {content: [{type: 'paragraph'}], type: 'doc'},
    bodyMd: '',
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id,
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: null,
    startAt: null,
    statusOptionId: 'status-1',
    statusPosition: 0,
    tags: [],
    title,
  }

  return {
    assignee: 'AL',
    card,
    completed: false,
    dueDate: '',
    effort: null,
    id,
    priority: 'None',
    status: 'To Do',
    title,
  }
}

function buildProps(overrides: Partial<TableTaskRowProps> = {}): TableTaskRowProps {
  return {
    activeTaskId: null,
    children: <div />,
    editInputRef: createRef<HTMLInputElement>(),
    editingTitle: '',
    isActiveTask: false,
    isDragOver: false,
    isDragged: false,
    isEditing: false,
    isPendingTask: false,
    isTaskDetailOpen: false,
    mode: 'light',
    onCancelEdit: vi.fn(),
    onContextMenu: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onEditTitle: vi.fn(),
    onOpenTask: vi.fn(),
    onSaveTitle: vi.fn(),
    onStartEditing: vi.fn(),
    onToggleComplete: vi.fn(),
    onToggleTaskSelection: vi.fn(),
    selected: false,
    task: createTask('task-1', 'Alpha'),
    titleWidth: 320,
    ...overrides,
  }
}

describe('TableTaskRow', () => {
  it('forwards shift-click selection from the checkbox', () => {
    const onToggleTaskSelection = vi.fn()

    render(<TableTaskRow {...buildProps({onToggleTaskSelection})} />)

    fireEvent.click(screen.getByRole('button', {name: 'Select task'}), {shiftKey: true})

    expect(onToggleTaskSelection).toHaveBeenCalledWith('task-1', true)
  })
})
