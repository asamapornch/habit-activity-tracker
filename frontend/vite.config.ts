import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Env vars live in the repo-root .env, same file the backend reads.
  envDir: path.resolve(__dirname, '..'),
})
