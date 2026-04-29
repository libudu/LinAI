import { execSync } from 'child_process'
import fs from 'fs-extra'
import JSZip from 'jszip'
import path from 'path'

async function main() {
  console.log('🚀 [Post-build] Starting...')

  // 0. 检查 git 状态与打 tag
  const isVersionBuild = process.argv.includes('--version')
  if (isVersionBuild) {
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
          `❌ [Post-build] 标签 ${tagName} 已存在，请在 package.json 中更新版本号。`
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
    console.log('⏭️ [Post-build] Skipping git status and tag check (not a version build).')
  }

  // 1. package.json 已经在 tsup 构建时自动生成到了 dist 目录，无需复制
  console.log('✅ [Post-build] package.json is already generated in dist/')

  // 2. 复制 dist-template 目录中的所有文件到 dist 目录
  const templateDir = 'dist-template'
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, 'dist', { overwrite: true })
    console.log('✅ [Post-build] Copied dist-template contents to dist/')
  } else {
    console.log(
      `⚠️ [Post-build] Directory ${templateDir} does not exist, skipping.`
    )
  }

  // 3. 删除 data 目录并复制 data-template 目录
  if (fs.existsSync('dist/data')) {
    fs.removeSync('dist/data')
  }
  fs.copySync('data-template', 'dist/data', { overwrite: true })
  console.log('✅ [Post-build] Copied data-template contents to dist/data/')

  // 4. 在 dist 目录中安装生产环境依赖
  console.log('📦 [Post-build] Installing production dependencies in dist/ ...')
  execSync('pnpm install --prod --shamefully-hoist', {
    cwd: 'dist',
    stdio: 'inherit'
  })

  // 5. 删除依赖配置
  fs.removeSync('dist/package.json')
  fs.removeSync('dist/pnpm-lock.yaml')
  console.log(
    '✅ [Post-build] Removed package.json and pnpm-lock.yaml from dist/'
  )

  // 6. 打包 dist 目录
  try {
    const pkg = fs.readJsonSync('package.json')
    const version = pkg.version
    const zipName = `LinAI v${version}.zip`
    console.log(`📦 [Post-build] Zipping dist directory to ${zipName}...`)

    const zip = new JSZip()

    const addFolderToZip = (folderPath: string, zipFolder: JSZip) => {
      const items = fs.readdirSync(folderPath)
      for (const item of items) {
        const itemPath = path.join(folderPath, item)
        const stat = fs.statSync(itemPath)
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
        level: 9
      }
    })
    fs.writeFileSync(zipName, content)
    const sizeMB = (content.length / (1024 * 1024)).toFixed(2)
    console.log(`✅ [Post-build] Successfully created ${zipName} (大小: ${sizeMB} MB)`)
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
