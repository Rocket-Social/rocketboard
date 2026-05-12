import {describe, expect, it} from 'vitest'
import {tiptapJsonToMarkdown} from './tiptap-to-markdown'

describe('tiptapJsonToMarkdown', () => {
  it('returns empty string for null/undefined', () => {
    expect(tiptapJsonToMarkdown(null)).toBe('')
    expect(tiptapJsonToMarkdown(undefined)).toBe('')
  })

  it('returns empty string for non-doc type', () => {
    expect(tiptapJsonToMarkdown({type: 'paragraph'})).toBe('')
  })

  it('converts headings', () => {
    const doc = {
      type: 'doc',
      content: [
        {type: 'heading', attrs: {level: 1}, content: [{type: 'text', text: 'Title'}]},
        {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Subtitle'}]},
        {type: 'heading', attrs: {level: 3}, content: [{type: 'text', text: 'Section'}]},
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('# Title')
    expect(result).toContain('## Subtitle')
    expect(result).toContain('### Section')
  })

  it('converts paragraphs with inline marks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'Hello '},
            {type: 'text', text: 'bold', marks: [{type: 'bold'}]},
            {type: 'text', text: ' and '},
            {type: 'text', text: 'italic', marks: [{type: 'italic'}]},
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toBe('Hello **bold** and *italic*')
  })

  it('converts bullet lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Item 1'}]}]},
            {type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Item 2'}]}]},
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('- Item 1')
    expect(result).toContain('- Item 2')
  })

  it('converts ordered lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'First'}]}]},
            {type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Second'}]}]},
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('1. First')
    expect(result).toContain('2. Second')
  })

  it('converts task lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {type: 'taskItem', attrs: {checked: false}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Todo'}]}]},
            {type: 'taskItem', attrs: {checked: true}, content: [{type: 'paragraph', content: [{type: 'text', text: 'Done'}]}]},
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('- [ ] Todo')
    expect(result).toContain('- [x] Done')
  })

  it('converts code blocks with language', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: {language: 'typescript'},
          content: [{type: 'text', text: 'const x = 1;'}],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('```typescript')
    expect(result).toContain('const x = 1;')
    expect(result).toContain('```')
  })

  it('converts blockquotes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{type: 'paragraph', content: [{type: 'text', text: 'Quote text'}]}],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('> Quote text')
  })

  it('converts horizontal rules', () => {
    const doc = {
      type: 'doc',
      content: [
        {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
        {type: 'horizontalRule'},
        {type: 'paragraph', content: [{type: 'text', text: 'After'}]},
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('---')
  })

  it('converts links', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'Click ', marks: []},
            {type: 'text', text: 'here', marks: [{type: 'link', attrs: {href: 'https://example.com'}}]},
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('[here](https://example.com)')
  })

  it('converts strikethrough and inline code', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'removed', marks: [{type: 'strike'}]},
            {type: 'text', text: ' and '},
            {type: 'text', text: 'code', marks: [{type: 'code'}]},
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('~~removed~~')
    expect(result).toContain('`code`')
  })

  it('encodes parentheses in link URLs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'React',
              marks: [{type: 'link', attrs: {href: 'https://en.wikipedia.org/wiki/React_(JavaScript_library)'}}],
            },
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toBe('[React](https://en.wikipedia.org/wiki/React_%28JavaScript_library%29)')
  })

  it('encodes spaces in link URLs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'page',
              marks: [{type: 'link', attrs: {href: 'https://example.com/my page'}}],
            },
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toBe('[page](https://example.com/my%20page)')
  })

  it('converts bold link combo', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [
                {type: 'bold'},
                {type: 'link', attrs: {href: 'https://example.com'}},
              ],
            },
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toBe('[**click here**](https://example.com)')
  })

  it('converts link inside list item', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {type: 'text', text: 'See '},
                    {type: 'text', text: 'docs', marks: [{type: 'link', attrs: {href: 'https://docs.example.com'}}]},
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = tiptapJsonToMarkdown(doc)
    expect(result).toContain('- See [docs](https://docs.example.com)')
  })

  it('handles empty document gracefully', () => {
    const doc = {
      type: 'doc',
      content: [{type: 'paragraph'}],
    }
    expect(tiptapJsonToMarkdown(doc)).toBe('')
  })
})
