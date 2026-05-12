import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'deploy-hosted.yml')
const workflowText = readFileSync(workflowPath, 'utf8')

function workflowInputBlock(inputName) {
  const match = workflowText.match(
    new RegExp(String.raw`${inputName}:\n((?:\s{8}.+\n)+)`, 'm'),
  )

  if (!match) {
    throw new Error(`Could not find workflow_dispatch input block for "${inputName}".`)
  }

  return match[1]
}

describe('Deploy Hosted workflow dispatch contract', () => {
  it('keeps bypass_staging_guard backward compatible for wrapper callers', () => {
    const inputBlock = workflowInputBlock('bypass_staging_guard')

    expect(inputBlock).toContain('type: boolean')
    expect(inputBlock).toContain('required: false')
    expect(inputBlock).toContain('default: false')
  })
})
