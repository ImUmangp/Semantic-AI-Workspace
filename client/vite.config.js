import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/search': 'http://localhost:3000',
      '/rag-chat': 'http://localhost:3000',
      '/test-chat': 'http://localhost:3000',
       "/upload-knowledge": "http://localhost:3000",
        "/admin": "http://localhost:3000",   
    },
  },
})
