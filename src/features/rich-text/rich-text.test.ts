import {describe, expect, it} from 'vitest'

import {normalizeRichTextDocument} from './rich-text'

describe('normalizeRichTextDocument', () => {
  it('drops unsafe persisted link marks while preserving other formatting', () => {
    const normalized = normalizeRichTextDocument({
      content: [{
        content: [{
          marks: [
            {type: 'bold'},
            {
              attrs: {href: 'javascript:alert(1)'},
              type: 'link',
            },
          ],
          text: 'Unsafe link',
          type: 'text',
        }],
        type: 'paragraph',
      }],
      type: 'doc',
    })

    expect(normalized).toMatchObject({
      content: [{
        content: [{
          marks: [{type: 'bold'}],
          text: 'Unsafe link',
          type: 'text',
        }],
        type: 'paragraph',
      }],
      type: 'doc',
    })
  })

  it('normalizes safe persisted link marks to the shared canonical URL form', () => {
    const normalized = normalizeRichTextDocument({
      content: [{
        content: [{
          marks: [{
            attrs: {href: ' HTTP://Example.com/docs '},
            type: 'link',
          }],
          text: 'Safe link',
          type: 'text',
        }],
        type: 'paragraph',
      }],
      type: 'doc',
    })

    expect(normalized).toMatchObject({
      content: [{
        content: [{
          marks: [{
            attrs: {href: 'http://example.com/docs'},
            type: 'link',
          }],
          text: 'Safe link',
          type: 'text',
        }],
        type: 'paragraph',
      }],
      type: 'doc',
    })
  })
})
