import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import netPlugin from './server/net-plugin.js'

// https://vite.dev/config/
// Relative base so the static build works under any path (e.g. GitHub Pages at /cue/).
export default defineConfig({
  base: './',
  plugins: [react(), netPlugin()],
})
