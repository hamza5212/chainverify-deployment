import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/health':          'http://127.0.0.1:5000',
      '/stats':           'http://127.0.0.1:5000',
      '/analytics':       'http://127.0.0.1:5000',
      '/news':            'http://127.0.0.1:5000',
      '/register':        'http://127.0.0.1:5000',
      '/register-all':    'http://127.0.0.1:5000',
      '/verify':          'http://127.0.0.1:5000',
      '/chain':           'http://127.0.0.1:5000',
      '/articles':        'http://127.0.0.1:5000',
      '/trusted-sources': 'http://127.0.0.1:5000',
      '/auth':            'http://127.0.0.1:5000',
    }
  }
})