import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
    reporters: [['default'], ['junit', { addFileAttribute: true }]],
    outputFile: {
      junit: './junit.xml',
    },
  },
})
