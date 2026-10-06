import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { familyApi } from './server/family-api.ts'

export default defineConfig({
  plugins: [react(), familyApi()],
  server: {
    host: '0.0.0.0',
    port: 47321,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
