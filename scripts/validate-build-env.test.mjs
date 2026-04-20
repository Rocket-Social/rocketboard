import {afterEach, describe, expect, it} from 'vitest'

import {LOCAL_SUPABASE_BUILD_OVERRIDE, validateBuildEnv} from './validate-build-env.mjs'

afterEach((context) => {
  delete context.task.meta.testEnv
})

describe('validateBuildEnv', () => {
  it('rejects production builds with a localhost Supabase URL', ({task}) => {
    task.meta.testEnv = {VITE_SUPABASE_URL: 'http://127.0.0.1:54321'}

    expect(() => validateBuildEnv({env: task.meta.testEnv})).toThrowError(
      /Refusing to build a production bundle with Supabase URL "http:\/\/127\.0\.0\.1:54321"/,
    )
  })

  it('allows hosted Supabase URLs', ({task}) => {
    task.meta.testEnv = {VITE_SUPABASE_URL: 'https://project.supabase.co'}

    expect(() => validateBuildEnv({env: task.meta.testEnv})).not.toThrow()
  })

  it('allows an explicit override for local-only builds', ({task}) => {
    task.meta.testEnv = {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      [LOCAL_SUPABASE_BUILD_OVERRIDE]: 'true',
    }

    expect(() => validateBuildEnv({env: task.meta.testEnv})).not.toThrow()
  })

  it('skips validation outside production mode', ({task}) => {
    task.meta.testEnv = {VITE_SUPABASE_URL: 'http://127.0.0.1:54321'}

    expect(() => validateBuildEnv({env: task.meta.testEnv, mode: 'development'})).not.toThrow()
  })
})
