/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useProjectPaletteCommands} from './useProjectPaletteCommands'

const baseArgs = {
  canEditProject: true,
  currentOrgRole: 'admin' as const,
  openCardComposer: vi.fn(),
  openProjectAccess: vi.fn(() => true),
  openProjectComposer: vi.fn(async () => true),
  openWorkspaceComposer: vi.fn(async () => true),
  resolvedProject: {
    name: 'Roadmap',
  } as any,
  setIsFieldManagerOpen: vi.fn(),
  toast: vi.fn(),
  workspace: {
    name: 'Main',
  } as any,
}

describe('useProjectPaletteCommands', () => {
  it('includes the workspace command for organization admins', () => {
    const {result} = renderHook(() =>
      useProjectPaletteCommands({
        ...baseArgs,
        canCreateWorkspace: true,
      }),
    )

    const workspaceCommand = result.current.find(
      (command) => command.id === 'action-create-workspace',
    )

    expect(workspaceCommand).toBeDefined()
    expect(workspaceCommand?.description).toBe(
      'Create a fresh workspace in the current organization.',
    )
  })

  it('omits the workspace command for non-admin organization members', () => {
    const {result} = renderHook(() =>
      useProjectPaletteCommands({
        ...baseArgs,
        canCreateWorkspace: false,
        currentOrgRole: 'member',
      }),
    )

    expect(result.current.map((command) => command.id)).not.toContain('action-create-workspace')
  })
})
