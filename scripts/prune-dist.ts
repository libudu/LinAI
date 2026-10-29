import fs from 'fs-extra'
import path from 'path'

// 只裁剪检查过的版本；依赖升级后保留完整包，重新确认运行入口再更新规则。
const packageRules = [
  {
    name: 'luxon',
    version: '3.7.2',
    files: [],
    directories: ['src/', 'build/amd/', 'build/global/', 'build/cjs-browser/'],
  },
  {
    name: 'libheif-js',
    version: '1.23.5',
    // heic-decode 和应用都使用 wasm-bundle.js（内嵌 WASM）。
    // 保留默认入口的 asm.js 实现、CommonJS bundle 及所有许可证。
    files: [
      'wasm.js',
      'libheif-wasm/libheif.js',
      'libheif-wasm/libheif.wasm',
      'libheif-wasm/libheif-bundle.mjs',
    ],
    directories: [],
  },
]

/** 只清理发布目录，不修改开发依赖、模板或用户数据。 */
export function pruneDist(distDirectory: string) {
  const root = path.resolve(distDirectory)
  const rules = packageRules.filter((rule) => {
    const manifestPath = path.join(
      root,
      'node_modules',
      rule.name,
      'package.json',
    )
    if (!fs.existsSync(manifestPath)) return false
    const manifest = fs.readJsonSync(manifestPath)
    if (manifest.version === rule.version) return true
    console.log(
      `ℹ️ [Post-build] 跳过未审查版本的裁剪：${rule.name}@${manifest.version}`,
    )
    return false
  })
  const metadata = new Set([
    'server/metafile-cjs.json',
    'node_modules/.modules.yaml',
    'node_modules/.pnpm-workspace-state-v1.json',
    'node_modules/.pnpm/lock.yaml',
  ])
  const candidates: { filePath: string; size: number }[] = []

  const collect = (directory: string) => {
    // lstat 不跟随链接，防止清理范围越过发布目录。
    const stat = fs.lstatSync(directory)
    if (stat.isSymbolicLink())
      throw new Error(`发布目录不能包含符号链接：${directory}`)
    if (!stat.isDirectory()) throw new Error(`发布目录不是目录：${directory}`)
    for (const entry of fs.readdirSync(directory)) {
      const filePath = path.join(directory, entry)
      const fileStat = fs.lstatSync(filePath)
      if (fileStat.isSymbolicLink())
        throw new Error(`发布目录不能包含符号链接：${filePath}`)
      if (fileStat.isDirectory()) {
        collect(filePath)
        continue
      }
      const relative = path.relative(root, filePath).split(path.sep).join('/')
      // 不按通用扩展名裁剪 runtime/data/client，保护清单、媒体资源和许可附件。
      if (metadata.has(relative)) {
        candidates.push({ filePath, size: fileStat.size })
        continue
      }
      if (!relative.startsWith('node_modules/')) continue
      if (/licen[cs]e|copying|copyright|notice|authors/i.test(entry)) continue
      const developmentFile = /(?:\.map|\.d\.[cm]?ts)$/.test(entry)
      const unusedDistribution = rules.some((rule) => {
        const prefix = `node_modules/${rule.name}/`
        if (!relative.startsWith(prefix)) return false
        const packagePath = relative.slice(prefix.length)
        return (
          rule.files.includes(packagePath) ||
          rule.directories.some((prefix) => packagePath.startsWith(prefix))
        )
      })
      if (developmentFile || unusedDistribution)
        candidates.push({ filePath, size: fileStat.size })
    }
  }

  // 先遍历确认范围内没有链接，再删除文件；不递归删除整个依赖目录。
  collect(root)
  let removedBytes = 0
  for (const { filePath, size } of candidates) {
    fs.unlinkSync(filePath)
    removedBytes += size
  }
  console.log(
    `🧹 [Post-build] 清理 ${candidates.length} 个发布冗余文件，减少 ${(removedBytes / 1024 / 1024).toFixed(2)} MiB（未压缩）`,
  )
}
