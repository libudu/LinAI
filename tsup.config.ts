import fs from 'fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: ['src/server/index.ts', 'src/server/migrate.ts'],
  format: ['cjs'],
  outDir: 'dist/server',
  clean: true,
  env: {
    APP_VERSION: pkg.version
  },
  metafile: true,
  noExternal: [/^(?!playwright$|playwright-core$|imagescript$).*$/],
  external: ['playwright', 'playwright-core', 'imagescript'],
  esbuildPlugins: [
    {
      name: 'generate-package-json',
      setup(build) {
        build.onEnd((result) => {
          if (!result.metafile) return

          const dependencies: Record<string, string> = {}
          const metafile = result.metafile

          // 收集所有外部依赖
          for (const output of Object.values(metafile.outputs)) {
            if (output.imports) {
              for (const imp of output.imports) {
                if (imp.external) {
                  const pkgName = imp.path.split('/')[0] // 简单处理包名，可能需要处理 @scope/pkg
                  const actualPkgName = imp.path.startsWith('@')
                    ? imp.path.split('/').slice(0, 2).join('/')
                    : pkgName

                  if (pkg.dependencies[actualPkgName]) {
                    dependencies[actualPkgName] =
                      pkg.dependencies[actualPkgName]
                  }
                }
              }
            }
          }

          const outPkg = {
            name: pkg.name,
            version: pkg.version,
            main: 'server/index.js',
            scripts: {
              start: 'NODE_ENV=production node server/index.js',
              postinstall: pkg.scripts.postinstall
            },
            dependencies
          }

          // 将 package.json 写入 outDir 父级，即 dist 目录
          fs.writeFileSync('dist/package.json', JSON.stringify(outPkg, null, 2))
          console.log(
            '✅ Generated dist/package.json with external dependencies'
          )
        })
      }
    }
  ]
})
