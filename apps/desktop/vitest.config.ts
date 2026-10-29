import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { buildFilesHelper } from './scripts/build-files-helper.mjs'

buildFilesHelper()

const alias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url))
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts', 'src/shared/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}']
        }
      }
    ]
  }
})
