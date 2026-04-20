import {describe, expect, it} from 'vitest'

import {
  DOCUMENT_CONFLICT,
  DOCUMENT_NOT_FOUND,
  DOCUMENT_TITLE_REQUIRED,
  getDocumentErrorCode,
  toDocumentErrorMessage,
} from './document.repository'

describe('document.repository error helpers', () => {
  it('reads Supabase-style plain object errors', () => {
    expect(getDocumentErrorCode({message: DOCUMENT_CONFLICT})).toBe(DOCUMENT_CONFLICT)
  })

  it('maps known document error codes to user-facing copy', () => {
    expect(toDocumentErrorMessage({message: DOCUMENT_CONFLICT})).toBe(
      'This document was updated somewhere else. Reload the latest version before saving again.',
    )
    expect(toDocumentErrorMessage({message: DOCUMENT_NOT_FOUND})).toBe(
      'This document project could not be loaded.',
    )
    expect(toDocumentErrorMessage({message: DOCUMENT_TITLE_REQUIRED})).toBe(
      'Add a title before saving this document.',
    )
  })

  it('falls back to the backend message for unknown errors', () => {
    expect(toDocumentErrorMessage({message: 'Something else broke'})).toBe('Something else broke')
  })
})
