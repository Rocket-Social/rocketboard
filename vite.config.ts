import react from '@vitejs/plugin-react'
import {configDefaults, defineConfig} from 'vitest/config'

const fontAssetPattern = /\.(woff2?|ttf|otf|eot)$/i

export function shouldInlineAsset(filePath: string): boolean | undefined {
  if (fontAssetPattern.test(filePath)) {
    return false
  }

  return undefined
}

export default defineConfig({
  build: {
    assetsInlineLimit(filePath) {
      return shouldInlineAsset(filePath)
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('@tanstack')) {
            return 'vendor-tanstack'
          }

          if (id.includes('@supabase')) {
            return 'vendor-supabase'
          }

          if (id.includes('@tiptap') || id.includes('/prosemirror-')) {
            return 'vendor-editor'
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }

          if (id.includes('@radix-ui')) {
            return 'vendor-radix'
          }

          return 'vendor'
        },
      },
    },
  },
  envPrefix: ['VITE_', 'SUPABASE_'],
  plugins: [react()],
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**', 'test-results/**'],
    setupFiles: ['src/test/setup.ts'],
  },
})
