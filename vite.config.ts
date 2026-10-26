import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { createDevAuth } from './src/server/common/auth/dev-proxy'
import { getAuthSecret } from './src/server/common/auth/secret'

export default defineConfig(async ({ command }) => {
  const auth =
    command === 'serve'
      ? createDevAuth(await getAuthSecret(), 'http://127.0.0.1:3001')
      : null
  return {
    plugins: [auth?.plugin, tailwindcss(), react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          login: fileURLToPath(new URL('./login.html', import.meta.url)),
        },
      },
    },
    publicDir: 'src/client/public',
    server: {
      port: 5174,
      // data/ 是后端运行时数据；整理图片时会高频原子写入，不应触发前端 HMR 文件监听
      watch: {
        ignored: ['**/data/**'],
      },
      proxy: auth
        ? {
            '/api': auth.proxy,
            '/v1': auth.proxy,
            '/auth': auth.proxy,
          }
        : undefined,
    },
  }
})
