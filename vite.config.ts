import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  },
  publicDir: 'src/client/public',
  server: {
    port: 5174,
    // data/ 是后端运行时数据；整理图片时会高频原子写入，不应触发前端 HMR 文件监听
    watch: {
      ignored: ['**/data/**']
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
})
