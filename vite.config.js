import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use the project-site base path so public assets resolve consistently on GitHub Pages.
  base: '/zoologist/'
})
