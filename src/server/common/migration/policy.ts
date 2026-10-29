// 新版迁移程序必须识别此参数，避免从压缩包启动后再次转交自身。
export const MIGRATION_WORKER_FLAG = '--linai-migration-worker-v1'

// 只保护真正的用户数据，新增程序目录默认随压缩包更新。
export const PRESERVED_DIRECTORIES = ['data']

// 旧版迁移会跳过 runtime，发布包中此目录只能放原有 Node.js 发行文件。
const nodeRuntimeFiles = new Set(
  [
    'node.exe',
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'corepack',
    'corepack.cmd',
    'install_tools.bat',
    'nodevars.bat',
    'npm',
    'npm.cmd',
    'npm.ps1',
    'npx',
    'npx.cmd',
    'npx.ps1',
  ].map((name) => `runtime/${name.toLowerCase()}`),
)
const nodeRuntimePackages = [
  'runtime/node_modules/corepack/',
  'runtime/node_modules/npm/',
]

/** 发布前拦截旧版迁移会静默漏掉的新增资源，不影响 data 下的初始数据模板。 */
export function assertReleaseMigrationPath(relativePath: string) {
  const key = relativePath.toLowerCase()
  if (key.startsWith('data') && !key.startsWith('data/'))
    throw new Error(
      `发布路径 ${relativePath} 会被旧版迁移跳过，请使用不以 data 开头的程序目录`,
    )
  if (!key.startsWith('runtime')) return
  if (
    nodeRuntimeFiles.has(key) ||
    nodeRuntimePackages.some((prefix) => key.startsWith(prefix))
  )
    return
  throw new Error(
    `发布路径 ${relativePath} 会被旧版迁移跳过；runtime 仅保留 Node.js，新增工具请放到 server/ 或其他程序目录`,
  )
}
