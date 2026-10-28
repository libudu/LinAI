import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { relative } from 'node:path'
import { fileURLToPath } from 'url'
import { defineConfig, normalizePath } from 'vite'
import { createDevAuth } from './src/server/common/auth/dev-proxy'
import { getAuthSecret } from './src/server/common/auth/secret'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

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
      // 仅递归监听 src；根目录保留入口 HTML、配置等文件的监听，不遍历其他目录。
      watch: {
        ignored: (path, stats) => {
          const relativePath = normalizePath(relative(projectRoot, path))
          if (
            relativePath === '.' ||
            relativePath === 'src' ||
            relativePath.startsWith('src/')
          )
            return false
          return relativePath.includes('/') || stats?.isDirectory() === true
        },
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
