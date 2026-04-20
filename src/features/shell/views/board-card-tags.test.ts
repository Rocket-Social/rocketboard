import {describe, expect, it} from 'vitest'

import {fitBoardCardTags} from './board-card-tags'

const measureText = (text: string) => text.length * 8

describe('fitBoardCardTags', () => {
  it('shows every tag when they fit', () => {
    expect(
      fitBoardCardTags({
        availableWidth: 120,
        measureText,
        tags: ['QA', 'Strategy'],
      }),
    ).toEqual({
      hiddenCount: 0,
      visibleTags: [
        {label: 'QA', truncated: false},
        {label: 'Strategy', truncated: false},
      ],
    })
  })

  it('truncates the next tag before falling back to a summary count', () => {
    expect(
      fitBoardCardTags({
        availableWidth: 86,
        measureText,
        tags: ['QA', 'Strategy'],
      }),
    ).toEqual({
      hiddenCount: 0,
      visibleTags: [
        {label: 'QA', truncated: false},
        {label: 'Strategy', maxWidth: 54, truncated: true},
      ],
    })
  })

  it('uses a summary count when the next tag cannot even fit in truncated form', () => {
    expect(
      fitBoardCardTags({
        availableWidth: 70,
        measureText,
        tags: ['QA', 'Strategy'],
      }),
    ).toEqual({
      hiddenCount: 1,
      visibleTags: [{label: 'QA', truncated: false}],
    })
  })

  it('keeps a trailing summary after showing one truncated tag', () => {
    expect(
      fitBoardCardTags({
        availableWidth: 102,
        measureText,
        tags: ['QA', 'Strategy', 'Design'],
      }),
    ).toEqual({
      hiddenCount: 1,
      visibleTags: [
        {label: 'QA', truncated: false},
        {label: 'Strategy', maxWidth: 50, truncated: true},
      ],
    })
  })

  it('can show a truncated first tag when no full tag fits', () => {
    expect(
      fitBoardCardTags({
        availableWidth: 64,
        measureText,
        tags: ['Strategy', 'Design'],
      }),
    ).toEqual({
      hiddenCount: 1,
      visibleTags: [{label: 'Strategy', maxWidth: 44, truncated: true}],
    })
  })
})
