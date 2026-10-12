import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:8090',
          changeOrigin: true,
        },
        '/jira-api': {
          target: env.VITE_JIRA_BASE_URL,
          changeOrigin: true,
          secure: true,
          rewrite: path => path.replace(/^\/jira-api/, ''),
        },
      },
    },
  }
})