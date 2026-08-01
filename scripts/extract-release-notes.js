// 从 src/client/pages/common/Notification/UpgradeContent.tsx 中提取指定版本的更新日志，
// 写入 release-notes.md 供 GitHub Release 使用。找不到对应日志时以非零码退出。
// 用法: node scripts/extract-release-notes.js v1.1.5
const fs = require('fs')
const path = require('path')

const tag = process.argv[2]
if (!tag) {
  console.error('❌ 用法: node scripts/extract-release-notes.js <tag>')
  process.exit(1)
}

const version = tag.replace(/^v/, '')

// tag 必须与 package.json 版本一致，否则构建出的 zip 文件名会对不上
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (pkg.version !== version) {
  console.error(
    `❌ tag ${tag} 与 package.json 版本 v${pkg.version} 不一致，请先更新版本号。`,
  )
  process.exit(1)
}

const file = path.join(
  'src',
  'client',
  'pages',
  'common',
  'Notification',
  'UpgradeContent.tsx',
)
const src = fs.readFileSync(file, 'utf8')

// 匹配 upgradeHistory 中以 `LinAI v<version> ` 开头的模板字符串
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const re = new RegExp('`LinAI v' + escaped + ' 更新内容[\\s\\S]*?`')
const match = src.match(re)
if (!match) {
  console.error(
    `❌ 未在 ${file} 中找到 LinAI v${version} 的更新日志，请先补充 upgradeHistory。`,
  )
  process.exit(1)
}

const notes = match[0].slice(1, -1).trim()
fs.writeFileSync('release-notes.md', notes + '\n')
console.log(`✅ 已提取 LinAI v${version} 更新日志:`)
console.log(notes)
