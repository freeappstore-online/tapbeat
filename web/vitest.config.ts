import { defineConfig } from 'vitest/config'

// Audio tests render through node-web-audio-api's OfflineAudioContext; UI
// tests opt into jsdom with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
