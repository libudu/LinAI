import { execFileSync, execSync } from 'child_process'
import fs from 'fs-extra'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import path from 'path'

async function main() {
  console.log('🚀 [Post-build] Starting...')

  // 必须携带已经准备好的独立核心，发布阶段不联网下载或临时编译。
  const easytierDir = path.resolve('dist-template/runtime/easytier')
  const easytierManifest = fs.readJsonSync(
    path.join(easytierDir, 'manifest.json'),
  ) as {
    version: string
    commit: string
    correspondingSource: { fileName: string; sha256: string; size: number }
    files: Record<string, string>
  }
  for (const name of [
    'easytier-core.exe',
    'easytier-cli.exe',
    'watch-parent.ps1',
    'LICENSE-LGPL-3.0.txt',
    'LICENSE-GPL-3.0.txt',
    'LICENSE-MINGW.txt',
    'build-portable.ps1',
    'SOURCES.md',
  ]) {
    if (!easytierManifest.files[name])
      throw new Error(`EasyTier 发布清单缺少 ${name}`)
  }
  for (const [name, hash] of Object.entries(easytierManifest.files)) {
    if (path.basename(name) !== name || name.endsWith('.zip'))
      throw new Error('EasyTier 发布清单路径无效')
    const actual = createHash('sha256')
      .update(fs.readFileSync(path.join(easytierDir, name)))
      .digest('hex')
    if (hash !== actual) throw new Error(`EasyTier 发布资源校验失败：${name}`)
  }

  // 对应源码单独发布；哈希将附件与清单中的固定核心版本绑定。
  const source = easytierManifest.correspondingSource
  if (
    !/^[a-f0-9]{40}$/.test(easytierManifest.commit) ||
    !/^[A-Za-z0-9.-]+$/.test(easytierManifest.version) ||
    !easytierManifest.version.endsWith(`.${easytierManifest.commit.slice(0, 7)}`) ||
    source?.fileName !== `EasyTier-${easytierManifest.version}-source.zip` ||
    !/^[a-f0-9]{64}$/.test(source.sha256)
  )
    throw new Error('EasyTier 对应源码附件清单无效')
  const sourcePath = path.resolve('release-resources/easytier', source.fileName)
  const sourceContent = fs.readFileSync(sourcePath)
  if (
    sourceContent.length !== source.size ||
    createHash('sha256').update(sourceContent).digest('hex') !== source.sha256
  )
    throw new Error('EasyTier 对应源码附件校验失败')

  // 0. 检查 git 状态与打 tag
  const skipTag = process.argv.includes('--skip-tag')
  if (!skipTag) {
    try {
      console.log('🔍 [Post-build] Checking git status...')
      const gitStatus = execSync('git status --porcelain').toString().trim()
      if (gitStatus) {
        console.error('❌ [Post-build] 工作区存在未提交的文件，请先 commit。')
        process.exit(1)
      }

      const pkg = fs.readJsonSync('package.json')
      const version = pkg.version
      const tagName = `v${version}`

      console.log(`🏷️ [Post-build] Checking tag ${tagName}...`)
      const existingTags = execSync('git tag -l')
        .toString()
        .split('\n')
        .map((t) => t.trim())
      if (existingTags.includes(tagName)) {
        console.error(
          `❌ [Post-build] 标签 ${tagName} 已存在，请在 package.json 中更新版本号。`,
        )
        process.exit(1)
      }

      console.log(`🏷️ [Post-build] Creating tag ${tagName}...`)
      execSync(`git tag ${tagName}`)
      console.log(`✅ [Post-build] Tag ${tagName} created successfully.`)
    } catch (error) {
      console.error('❌ [Post-build] Git 操作失败:', error)
      process.exit(1)
    }
  } else {
    console.log(
      '⏭️ [Post-build] Skipping git status and tag check (not a version build).',
    )
  }

  // 1. package.json 已经在 tsup 构建时自动生成到了 dist 目录，无需复制
  console.log('✅ [Post-build] package.json is already generated in dist/')

  // 2. 复制模板，EasyTier 只复制已校验的运行资源
  const templateDir = 'dist-template'
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, 'dist', {
      overwrite: true,
      filter: (file) => path.resolve(file) !== easytierDir,
    })
    // 重建此目录，清除旧构建遗留的 source.zip，dist 本身也不携带源码归档。
    const distEasytierDir = path.resolve('dist/runtime/easytier')
    fs.emptyDirSync(distEasytierDir)
    for (const name of ['manifest.json', ...Object.keys(easytierManifest.files)]) {
      fs.copyFileSync(
        path.join(easytierDir, name),
        path.join(distEasytierDir, name),
      )
    }
    console.log('✅ [Post-build] Copied dist-template contents to dist/')
  } else {
    console.log(
      `⚠️ [Post-build] Directory ${templateDir} does not exist, skipping.`,
    )
  }

  // 3. 删除 data 目录并复制 data-template 目录
  if (fs.existsSync('dist/data')) {
    fs.removeSync('dist/data')
  }
  fs.copySync('data-template', 'dist/data', { overwrite: true })
  console.log('✅ [Post-build] Copied data-template contents to dist/data/')

  // 4. 复用项目已安装的 FFmpeg，避免全新安装发布依赖时再次从 GitHub 下载。
  const distDir = path.resolve('dist')
  const distPkgPath = path.join(distDir, 'package.json')
  const distPkg = fs.readJsonSync(distPkgPath)
  const installEnv = { ...process.env }
  let ffmpegFiles: { sourcePath: string; fileName: string }[] = []

  if (distPkg.dependencies?.['ffmpeg-static']) {
    const ffmpegDir = path.resolve('node_modules/ffmpeg-static')
    const ffmpegPkg = fs.readJsonSync(path.join(ffmpegDir, 'package.json'))
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const binaryPath = path.join(ffmpegDir, binaryName)

    ffmpegFiles = [
      binaryName,
      `${binaryName}.README`,
      `${binaryName}.LICENSE`,
    ].map((fileName) => {
      const sourcePath = path.join(ffmpegDir, fileName)
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new Error(
          `本地 FFmpeg 文件不完整，请先用 pnpm 重新安装：${sourcePath}`,
        )
      }
      return { sourcePath, fileName }
    })

    // 下载失败也可能留下非空但损坏的二进制，不能仅按文件是否存在判断。
    execFileSync(binaryPath, ['-version'], { timeout: 10_000, stdio: 'pipe' })

    // 固定到本地包版本，确保复制的二进制与发布包一致。
    distPkg.dependencies['ffmpeg-static'] = ffmpegPkg.version
    fs.writeJsonSync(distPkgPath, distPkg, { spaces: 2 })
    // install.js 会检查 FFMPEG_BIN 指向的文件并跳过下载；此变量仅传给安装子进程。
    installEnv.FFMPEG_BIN = binaryPath
    console.log(
      `✅ [Post-build] Reusing local ffmpeg-static ${ffmpegPkg.version} binary`,
    )
  }

  // 5. 发布依赖每次全新安装，避免已移除的包残留在 .pnpm 中被打进 ZIP。
  fs.removeSync(path.join(distDir, 'node_modules'))
  fs.removeSync(path.join(distDir, 'pnpm-lock.yaml'))
  console.log(
    '✅ [Post-build] Cleaned previous production dependencies in dist/',
  )

  // 6. 将 pnpm 项目级配置复制到 dist，确保 allowBuilds 等设置对独立安装生效
  const pnpmWorkspacePath = 'pnpm-workspace.yaml'
  const distPnpmWorkspacePath = path.join('dist', 'pnpm-workspace.yaml')
  fs.removeSync(distPnpmWorkspacePath)
  if (fs.existsSync(pnpmWorkspacePath)) {
    fs.copySync(pnpmWorkspacePath, distPnpmWorkspacePath, { overwrite: true })
    console.log('✅ [Post-build] Copied pnpm-workspace.yaml to dist/')
  }

  // 7. 平铺安装真实文件；shamefully-hoist 仍使用符号链接，ZIP 递归时会重复收录。
  // 禁用副作用缓存，避免跳过下载的 FFmpeg 安装结果污染后续正常安装。
  console.log('📦 [Post-build] Installing production dependencies in dist/ ...')
  execSync(
    'pnpm install --prod --config.node-linker=hoisted --package-import-method=copy --config.side-effects-cache=false --reporter=append-only',
    {
      cwd: distDir,
      stdio: 'inherit',
      env: installEnv,
    },
  )

  // 8. 将真实文件和许可证放入发布包，运行时无需本机路径或环境变量。
  const distFfmpegDir = path.join(distDir, 'node_modules/ffmpeg-static')
  for (const { sourcePath, fileName } of ffmpegFiles) {
    fs.copyFileSync(sourcePath, path.join(distFfmpegDir, fileName))
  }
  if (ffmpegFiles.length > 0) {
    execFileSync(
      path.join(distFfmpegDir, ffmpegFiles[0].fileName),
      ['-version'],
      {
        timeout: 10_000,
        stdio: 'pipe',
      },
    )
    console.log('✅ [Post-build] Copied and verified FFmpeg binary in dist/')
  }

  // 9. 删除依赖配置
  fs.removeSync('dist/package.json')
  fs.removeSync('dist/pnpm-lock.yaml')
  if (fs.existsSync(distPnpmWorkspacePath)) {
    fs.removeSync(distPnpmWorkspacePath)
  }
  console.log(
    '✅ [Post-build] Removed package.json, pnpm-lock.yaml and pnpm-workspace.yaml from dist/',
  )

  // 10. 打包 dist 目录
  try {
    const pkg = fs.readJsonSync('package.json')
    const version = pkg.version

    let suffix = ''
    if (process.argv.includes('--private')) {
      suffix = '-private'
    } else if (process.argv.includes('--public')) {
      suffix = '-public'
    }

    const zipName = `LinAI v${version}${suffix}.zip`
    console.log(`📦 [Post-build] Zipping dist directory to ${zipName}...`)

    const zip = new JSZip()

    const addFolderToZip = (folderPath: string, zipFolder: JSZip) => {
      const items = fs.readdirSync(folderPath)
      for (const item of items) {
        const itemPath = path.join(folderPath, item)
        const stat = fs.lstatSync(itemPath)
        if (stat.isSymbolicLink()) {
          throw new Error(
            `发布目录不能包含符号链接，请检查依赖安装方式：${itemPath}`,
          )
        }
        if (stat.isDirectory()) {
          const subFolder = zipFolder.folder(item)
          if (subFolder) addFolderToZip(itemPath, subFolder)
        } else {
          zipFolder.file(item, fs.readFileSync(itemPath))
        }
      }
    }

    addFolderToZip('dist', zip)

    const content = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9,
      },
    })
    fs.writeFileSync(zipName, content)
    // private/public 使用同一份附件名和内容，不再次压缩源码 ZIP。
    fs.writeFileSync(path.resolve(source.fileName), sourceContent)
    const sizeMB = (content.length / (1024 * 1024)).toFixed(2)
    console.log(
      `✅ [Post-build] Successfully created ${zipName} (大小: ${sizeMB} MB)`,
    )
    console.log(
      `✅ [Post-build] 源码附件：${source.fileName}；必须与主包在同一发布页免费提供并维护可用性。`,
    )
  } catch (error) {
    console.error('❌ [Post-build] 打包压缩文件失败:', error)
    process.exit(1)
  }

  console.log('🎉 [Post-build] Completed successfully.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
