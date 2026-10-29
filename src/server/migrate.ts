import fs from 'fs-extra'
import JSZip from 'jszip'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { open } from 'node:fs/promises'
import path from 'path'
import {
  MIGRATION_WORKER_FLAG,
  PRESERVED_DIRECTORIES,
} from './common/migration/policy'

async function runLatestMigrator(
  zip: JSZip,
  zipRootPath: string,
  rootDir: string,
  zipPath: string,
) {
  const migrator = zip.file(`${zipRootPath}server/migrate.js`)
  if (!migrator) throw new Error('新版压缩包缺少 server/migrate.js，无法升级')
  // 与正式脚本同级，保证新版迁移程序通过 __dirname 得到正确的软件目录。
  const scriptPath = path.join(
    rootDir,
    'server',
    `.linai-migrate-${randomUUID()}.js`,
  )
  const content = await migrator.async('nodebuffer')
  const scriptFile = await open(scriptPath, 'wx')
  try {
    try {
      await scriptFile.writeFile(content)
    } finally {
      await scriptFile.close()
    }
    console.log('正在使用新版本的迁移程序...')
    process.exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [scriptPath, zipPath, MIGRATION_WORKER_FLAG],
        { stdio: 'inherit', windowsHide: true },
      )
      child.once('error', reject)
      child.once('close', (code, signal) => {
        if (code === null)
          reject(new Error(`新版迁移程序异常退出：${signal || '未知原因'}`))
        else resolve(code)
      })
    })
  } finally {
    await fs.remove(scriptPath)
  }
}

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

  const zipPath = process.argv[2] ? path.resolve(process.argv[2]) : ''
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

  // 同时核对服务端入口，避免新增工具中同名的批处理被误认成软件根目录。
  const startupName = '双击运行.bat'
  const packageRoots = Object.values(zip.files)
    .filter(
      (file) =>
        !file.dir &&
        (file.name === startupName || file.name.endsWith(`/${startupName}`)),
    )
    .map((file) => file.name.slice(0, -startupName.length))
    .filter(
      (prefix) =>
        zip.file(`${prefix}server/index.js`) &&
        zip.file(`${prefix}server/migrate.js`),
    )

  if (packageRoots.length !== 1) {
    console.error(
      '错误：压缩包中未找到唯一的软件目录，请确认包含“双击运行.bat”和完整的 server 目录。',
    )
    process.exitCode = 1
    return
  }
  const zipRootPath = packageRoots[0]

  // 批处理保持稳定，由当前程序转交新版程序，让新版迁移规则在这次升级就生效。
  if (process.argv[3] !== MIGRATION_WORKER_FLAG) {
    await runLatestMigrator(zip, zipRootPath, rootDir, zipPath)
    return
  }

  // 依赖整体替换，避免已移除的包继续残留。
  const replacementPaths = ['node_modules'].filter((directory) =>
    Object.entries(zip.files).some(
      ([relativePath, file]) =>
        !file.dir && relativePath.startsWith(`${zipRootPath}${directory}/`),
    ),
  )
  console.log('正在解压新版本文件，请稍候...')
  let extractedCount = 0
  const stagingDir = replacementPaths.length
    ? await fs.mkdtemp(path.join(rootDir, '.linai-migration-'))
    : null
  const replacements = stagingDir
    ? replacementPaths.map((relativePath) => ({
        relativePath,
        targetPath: path.join(rootDir, relativePath),
        stagedPath: path.join(stagingDir, 'next', relativePath),
        previousPath: path.join(stagingDir, 'previous', relativePath),
        installed: false,
      }))
    : []

  try {
    for (const relativePath of Object.keys(zip.files)) {
      const file = zip.files[relativePath]

      // 忽略目录条目，在解压文件时会自动创建所需的目录
      if (file.dir) continue

      // 只处理位于我们找到的根目录下的文件
      if (!relativePath.startsWith(zipRootPath)) continue

      // 先规范化并检查实际目标，避免大小写、反斜杠或路径跳转绕过数据保护。
      const installedPath = path.resolve(
        rootDir,
        relativePath.substring(zipRootPath.length),
      )
      const targetRelativePath = path.relative(rootDir, installedPath)
      if (
        !targetRelativePath ||
        targetRelativePath === '..' ||
        targetRelativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(targetRelativePath) ||
        targetRelativePath.includes(':')
      )
        throw new Error(`压缩包包含无效路径：${relativePath}`)
      const targetKey = targetRelativePath
        .split(path.sep)
        .join('/')
        .toLowerCase()

      // 默认更新所有文件，仅保留用户数据和无法覆盖的当前 Node 可执行文件。
      if (
        PRESERVED_DIRECTORIES.some(
          (directory) =>
            targetKey === directory || targetKey.startsWith(`${directory}/`),
        ) ||
        installedPath.toLowerCase() ===
          path.resolve(process.execPath).toLowerCase()
      ) {
        continue
      }

      const replacement = replacements.find((entry) =>
        targetKey.startsWith(`${entry.relativePath}/`),
      )
      const targetDir =
        replacement && stagingDir ? path.join(stagingDir, 'next') : rootDir
      const targetFullPath = path.join(targetDir, targetRelativePath)

      // 确保目标目录存在
      await fs.ensureDir(path.dirname(targetFullPath))

      // 写入文件
      const content = await file.async('nodebuffer')
      await fs.writeFile(targetFullPath, content)
      extractedCount++
    }

    for (const replacement of replacements) {
      const hadDirectory = await fs.pathExists(replacement.targetPath)
      if (hadDirectory) {
        await fs.move(replacement.targetPath, replacement.previousPath)
      }
      try {
        await fs.move(replacement.stagedPath, replacement.targetPath)
        replacement.installed = true
        console.log(`已更新 ${replacement.relativePath}`)
      } catch (error) {
        if (hadDirectory) {
          await fs.move(replacement.previousPath, replacement.targetPath)
        }
        throw error
      }
    }
  } finally {
    if (stagingDir) {
      let preserveStaging = false
      for (const replacement of replacements) {
        if (
          !replacement.installed &&
          (await fs.pathExists(replacement.previousPath))
        ) {
          // 回滚失败时保留旧目录，避免清理暂存目录造成数据丢失。
          preserveStaging = true
          console.error(`旧目录恢复失败，已保留在：${replacement.previousPath}`)
        }
      }
      if (!preserveStaging) await fs.remove(stagingDir)
    }
  }

  // 旧版网络运行资源不再随新版分发；仅清理程序目录，保留整个 data 目录。
  for (const directory of ['server/easytier', 'runtime/easytier']) {
    await fs.remove(path.join(rootDir, directory))
  }

  console.log(`\n迁移完成！共更新/覆盖了 ${extractedCount} 个文件。`)
  console.log(`已成功迁移到新版 v${process.env.APP_VERSION || '未知'}\n`)
}

run().catch((err) => {
  console.error('迁移过程中发生未捕获的错误：', err)
  process.exitCode = 1
})
