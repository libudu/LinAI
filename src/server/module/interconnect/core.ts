import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { dataPath } from '../../common/storage/data-path'

const execute = promisify(execFile)
const runtime = path.resolve(process.cwd(), 'runtime/easytier')
const developmentRuntime = path.resolve(
  process.cwd(),
  'dist-template/runtime/easytier',
)

export const SHARING_PORT = 18243
export const HOST_IP = '10.127.62.1'

export async function freeLoopbackPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('无法分配本地端口')
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

async function coreDirectory() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('远程互联目前仅支持 Windows x64')
  const directory = await fs.access(path.join(runtime, 'manifest.json')).then(
    () => runtime,
    () => developmentRuntime,
  )
  const manifest = JSON.parse(
    await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
  ) as { files: Record<string, string> }
  // files 仅包含包内资源；correspondingSource 是外置附件信息，不参与启动校验。
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (path.basename(file) !== file)
      throw new Error('EasyTier 清单包含无效文件名')
    const actual = createHash('sha256')
      .update(await fs.readFile(path.join(directory, file)))
      .digest('hex')
    if (actual !== hash) throw new Error(`EasyTier 文件校验失败：${file}`)
  }
  for (const file of [
    'easytier-core.exe',
    'easytier-cli.exe',
    'watch-parent.ps1',
  ])
    if (!manifest.files[file])
      throw new Error(`EasyTier 发布资源不完整：${file}`)
  return directory
}

function childEnvironment() {
  // 不让外部 ET_* 环境变量覆盖 no-tun、RPC、ACL 和监听配置。
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith('ET_'),
    ),
  )
}

export type Core = {
  process: ChildProcess
  directory: string
  configFile: string
  rpcPort: number
  forwardPort: number | null
  stop: () => Promise<void>
}

export async function command<T>(core: Core, args: string[]): Promise<T> {
  try {
    const result = await execute(
      path.join(core.directory, 'easytier-cli.exe'),
      [
        '--rpc-portal',
        `127.0.0.1:${core.rpcPort}`,
        '--output',
        'json',
        ...args,
      ],
      {
        windowsHide: true,
        env: childEnvironment(),
        timeout: 6000,
        maxBuffer: 1024 * 1024,
      },
    )
    return JSON.parse(result.stdout) as T
  } catch {
    // CLI 输出可能包含配置或凭据，不传入日志与错误响应。
    throw new Error('无法读取 EasyTier 状态，请检查核心进程及节点连接')
  }
}

export async function startCore(options: {
  roomId: string
  peers: string[]
  secret?: string
  credential?: string
  ip: string
}) {
  const directory = await coreDirectory()
  const rpcPort = await freeLoopbackPort()
  let forwardPort = options.credential ? await freeLoopbackPort() : null
  // 查询空闲端口后尚未绑定，系统可能立即复用同一个端口。
  while (forwardPort === rpcPort) forwardPort = await freeLoopbackPort()
  const configFile = dataPath('interconnect', 'active.toml')
  await fs.mkdir(path.dirname(configFile), { recursive: true })
  const q = (value: string) => JSON.stringify(value)
  const chain = (type: number, rules = '') => `
[[acl.acl_v1.chains]]
name = "linai-${type}"
chain_type = ${type}
enabled = true
default_action = 2
${rules}`
  const rule = (name: string, fields: string) => `
[[acl.acl_v1.chains.rules]]
name = "${name}"
priority = 1000
enabled = true
action = 1
protocol = 1
${fields}
`
  const config = `instance_name = "LinAI remote interconnect"
ipv4 = ${q(`${options.ip}/24`)}
dhcp = false
listeners = ["tcp://0.0.0.0:0", "udp://0.0.0.0:0"]
${options.peers.map((peer) => `[[peer]]\nuri = ${q(peer)}\n`).join('\n')}
[network_identity]
network_name = ${q(`linai-${options.roomId}`)}
${options.secret ? `network_secret = ${q(options.secret)}` : ''}
[secure_mode]
enabled = true
${options.credential ? `local_private_key = ${q(options.credential)}` : ''}
[flags]
no_tun = true
use_smoltcp = true
enable_ipv6 = false
enable_exit_node = false
proxy_forward_by_system = false
accept_dns = false
disable_upnp = true
enable_udp_broadcast_relay = false
relay_network_whitelist = ""
${
  forwardPort
    ? `
[[port_forward]]
bind_addr = "127.0.0.1:${forwardPort}"
dst_addr = "${HOST_IP}:${SHARING_PORT}"
proto = "tcp"`
    : ''
}
${chain(1, options.secret ? rule('eagle-read-only', `destination_ips = ["${HOST_IP}/32"]\nports = ["${SHARING_PORT}"]`) : '')}
${chain(
  2,
  options.secret
    ? rule(
        'eagle-response',
        `source_ips = ["${HOST_IP}/32"]\nsource_ports = ["${SHARING_PORT}"]`,
      )
    : rule(
        'eagle-request',
        `destination_ips = ["${HOST_IP}/32"]\nports = ["${SHARING_PORT}"]`,
      ),
)}
${chain(3)}
`
  await fs.writeFile(configFile, config, { mode: 0o600 })
  const child = spawn(
    path.join(directory, 'easytier-core.exe'),
    [
      '--config-file',
      configFile,
      '--rpc-portal',
      `127.0.0.1:${rpcPort}`,
      '--rpc-portal-whitelist',
      '127.0.0.1/32',
      '--console-log-level',
      'error',
    ],
    {
      cwd: directory,
      windowsHide: true,
      stdio: 'ignore',
      env: childEnvironment(),
    },
  )
  let spawnFailed = false
  child.once('error', () => {
    spawnFailed = true
  })
  const core: Core = {
    process: child,
    directory,
    configFile,
    rpcPort,
    forwardPort,
    stop: async () => {
      child.kill()
      if (child.exitCode === null && child.pid && !spawnFailed) {
        await Promise.race([
          new Promise<void>((resolve) => child.once('exit', () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ])
      }
      await fs.rm(configFile, { force: true })
    },
  }
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', () => reject(new Error('EasyTier 核心无法启动')))
    })
    // 父进程异常退出时也清理独立核心；只监视此进程句柄，不按名称杀其他 EasyTier。
    const watcher = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(directory, 'watch-parent.ps1'),
        '-ParentId',
        String(process.pid),
        '-CoreId',
        String(child.pid),
      ],
      { windowsHide: true, stdio: 'ignore' },
    )
    let watcherError = false
    watcher.once('error', () => {
      watcherError = true
      child.kill()
    })
    watcher.once('exit', () => {
      if (child.exitCode === null) {
        watcherError = true
        child.kill()
      }
    })
    watcher.unref()
    for (let attempt = 0; attempt < 30; attempt++) {
      if (spawnFailed || watcherError || child.exitCode !== null)
        throw new Error('EasyTier 核心启动失败，请检查发布资源或本机安全软件')
      try {
        await command(core, ['node'])
        return core
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
    throw new Error('EasyTier 核心启动超时')
  } catch (error) {
    await core.stop()
    throw error
  }
}
