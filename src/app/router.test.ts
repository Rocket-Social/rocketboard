import { describe, expect, it } from 'vitest'

describe('router', () => {
  it('imports without throwing route configuration errors', async () => {
    await expect(import('./router')).resolves.toHaveProperty('router')
  })
})
