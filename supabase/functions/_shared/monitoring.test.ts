import {describe, expect, it} from 'vitest'

import {buildEdgeExceptionEvent} from './monitoring.ts'

describe('buildEdgeExceptionEvent', () => {
  it('builds the manual PostHog $exception schema', () => {
    const error = new Error('boom')
    error.name = 'RangeError'
    error.stack = [
      'RangeError: boom',
      '    at processJob (file:///srv/functions/example.ts:42:9)',
      '    at main (file:///srv/functions/example.ts:57:3)',
    ].join('\n')

    const event = buildEdgeExceptionEvent(error, {
      functionName: 'example-function',
      userId: 'user-123',
    })

    expect(event).toMatchObject({
      distinct_id: 'user-123',
      event: '$exception',
      properties: {
        distinct_id: 'user-123',
        $exception_level: 'error',
        rocketboard_function: 'example-function',
        rocketboard_surface: 'edge',
      },
    })
    expect(event.properties.$exception_list).toHaveLength(1)
    expect(event.properties.$exception_list[0]).toMatchObject({
      type: 'RangeError',
      value: 'boom',
      mechanism: {
        handled: true,
        synthetic: false,
        type: 'generic',
      },
      stacktrace: {
        type: 'raw',
      },
    })
    expect(event.properties.$exception_list[0].stacktrace?.frames).toEqual([
      {
        platform: 'custom',
        lang: 'javascript',
        function: 'processJob',
        filename: 'file:///srv/functions/example.ts',
        lineno: 42,
        colno: 9,
      },
      {
        platform: 'custom',
        lang: 'javascript',
        function: 'main',
        filename: 'file:///srv/functions/example.ts',
        lineno: 57,
        colno: 3,
      },
    ])
  })

  it('marks anonymous edge events to skip person processing', () => {
    const event = buildEdgeExceptionEvent(new Error('boom'), {
      functionName: 'example-function',
    })

    expect(event.distinct_id).toBe('edge-anonymous:example-function')
    expect(event.properties.$process_person_profile).toBe(false)
  })
})
