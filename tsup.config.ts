import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server/index.ts'],
  format: ['cjs'],
  outDir: 'dist/server',
  clean: true
})
