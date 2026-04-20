import {describe, expect, it} from 'vitest'

import viteConfig, {shouldInlineAsset} from './vite.config'

describe('shouldInlineAsset', () => {
  it('never inlines font assets', () => {
    expect(shouldInlineAsset('/assets/inter.woff2')).toBe(false)
    expect(shouldInlineAsset('/assets/inter.woff')).toBe(false)
    expect(shouldInlineAsset('/assets/inter.ttf')).toBe(false)
    expect(shouldInlineAsset('/assets/inter.otf')).toBe(false)
    expect(shouldInlineAsset('/assets/inter.eot')).toBe(false)
  })

  it('leaves non-font assets on vite defaults', () => {
    expect(shouldInlineAsset('/assets/logo.svg')).toBeUndefined()
    expect(shouldInlineAsset('/assets/icon.png')).toBeUndefined()
  })

  it('wires the build inline limit through the font helper', () => {
    const assetsInlineLimit = viteConfig.build?.assetsInlineLimit as
      | ((filePath: string) => boolean | undefined)
      | undefined

    expect(assetsInlineLimit?.('/assets/inter.woff2')).toBe(false)
    expect(assetsInlineLimit?.('/assets/logo.svg')).toBeUndefined()
  })
})
