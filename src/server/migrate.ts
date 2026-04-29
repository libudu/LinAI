import fs from 'fs-extra'
import JSZip from 'jszip'
import path from 'path'

async function run() {
  const rootDir = path.resolve(__dirname, '..')
  const batPath = path.join(rootDir, '双击运行.bat')
  console.log(`正在运行 LinAI 版本迁移脚本 🐱`)

  if (!fs.existsSync(batPath)) {
    console.error(
      '错误：当前项目不存在旧版软件，请将迁移脚本放在正确的软件目录下。',
    )
    // 暂停以防命令行窗口一闪而过
    process.exitCode = 1
    return
  }

  const zipPath = process.argv[2]
  if (!zipPath) {
    console.error(
      '错误：未提供新版本压缩包路径。请将压缩包拖拽到“版本迁移，把新版压缩包拖进来.bat”文件上。',
    )
    process.exitCode = 1
    return
  }

  if (!fs.existsSync(zipPath)) {
    console.error(`错误：找不到压缩包文件 ${zipPath}`)
    process.exitCode = 1
    return
  }

  console.log(`正在读取压缩包: ${zipPath}...`)
  let zipBuffer: Buffer
  try {
    zipBuffer = await fs.readFile(zipPath)
  } catch (err) {
    console.error('错误：无法读取压缩包文件，请检查文件权限或是否被占用。', err)
    process.exitCode = 1
    return
  }

  const zip = new JSZip()
  try {
    await zip.loadAsync(zipBuffer)
  } catch (err) {
    console.error('错误：解析压缩包失败，这可能不是一个有效的 ZIP 文件。', err)
    process.exitCode = 1
    return
  }

  // 检查压缩包内是否包含 双击运行.bat
  // 压缩包可能带有顶层目录，比如 wan-video-download-1.0.0/双击运行.bat
  let batZipPath: string | null = null
  let zipRootPath = ''

  zip.forEach((relativePath, _file) => {
    if (
      relativePath === '双击运行.bat' ||
      relativePath.endsWith('/双击运行.bat')
    ) {
      batZipPath = relativePath
      zipRootPath = relativePath.substring(
        0,
        relativePath.length - '双击运行.bat'.length,
      )
    }
  })

  if (!batZipPath) {
    console.error(
      '错误：压缩包错误，未在压缩包中找到“双击运行.bat”。这可能不是一个有效的新版本压缩包。',
    )
    process.exitCode = 1
    return
  }

  console.log('正在解压新版本文件，请稍候...')
  let extractedCount = 0

  for (const relativePath of Object.keys(zip.files)) {
    const file = zip.files[relativePath]

    // 忽略目录条目，在解压文件时会自动创建所需的目录
    if (file.dir) continue

    // 只处理位于我们找到的根目录下的文件
    if (!relativePath.startsWith(zipRootPath)) continue

    // 去掉顶层目录，获取实际相对于解压根目录的路径
    const targetRelativePath = relativePath.substring(zipRootPath.length)

    // 跳过 data、runtime 目录及其下的所有文件
    if (
      targetRelativePath.startsWith('data') ||
      targetRelativePath.startsWith('runtime')
    ) {
      continue
    }

    const targetFullPath = path.join(rootDir, targetRelativePath)

    // 确保目标目录存在
    await fs.ensureDir(path.dirname(targetFullPath))

    // 写入文件
    const content = await file.async('nodebuffer')
    await fs.writeFile(targetFullPath, content)
    extractedCount++
  }

  console.log(`\n迁移完成！共更新/覆盖了 ${extractedCount} 个文件。`)
  console.log(`已成功迁移到新版 v${process.env.APP_VERSION || '未知'}\n`)
}

run().catch((err) => {
  console.error('迁移过程中发生未捕获的错误：', err)
  process.exitCode = 1
})
