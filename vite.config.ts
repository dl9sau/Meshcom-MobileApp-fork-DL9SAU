import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { execSync } from 'child_process'

// short git commit hash for the fork version suffix (App Version: X-DL9SAU-g<hash>).
// falls back to "nogit" when building without a git checkout.
let gitHash = 'nogit'
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // no git available - keep the fallback
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [
    react()
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  }
})
