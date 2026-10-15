import { defineConfig } from 'vitest/config'

// Audio tests render through node-web-audio-api's OfflineAudioContext.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
