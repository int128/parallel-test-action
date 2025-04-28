import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
    reporters: ['junit'],
    outputFile: {
      junit: './junit.xml',
    },
  },
})
