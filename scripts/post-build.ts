import AdmZip from 'adm-zip'
import { execSync } from 'child_process'
import fs from 'fs-extra'

function main() {
  console.log('🚀 [Post-build] Starting...')

  // 0. 检查 git 状态与打 tag
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

    const zip = new AdmZip()
    zip.addLocalFolder('dist')
    zip.writeZip(zipName)
    console.log(`✅ [Post-build] Successfully created ${zipName}`)
  } catch (error) {
    console.error('❌ [Post-build] 打包压缩文件失败:', error)
    process.exit(1)
  }

  console.log('🎉 [Post-build] Completed successfully.')
}

main()
