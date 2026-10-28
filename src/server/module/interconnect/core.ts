import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { dataPath } from '../../common/storage/data-path'
import { CoreOutput } from './output'

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
  output: CoreOutput
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
  } catch (error) {
    // 只取 CLI 的错误输出，不返回可能包含配置或凭据的 JSON stdout。
    const stderr =
      error &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? core.output.sanitize(error.stderr.trim())
        : ''
    throw new Error(
      stderr ||
        core.output.message({ includeConnectionRetries: false }) ||
        'EasyTier RPC unavailable',
    )
  }
}

function forwardReady(port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('error', reject)
    socket.once('timeout', () =>
      socket.destroy(new Error('EasyTier port forward timeout')),
    )
  })
}

/** 将房主的实际监听地址带入邀请，同机/局域网连接不依赖公共节点。 */
export async function invitationPeers(core: Core, peers: string[]) {
  const info = await command<{ listeners: string[] }>(core, ['node'])
  const addresses = [
    ...new Set(
      Object.values(networkInterfaces()).flatMap((entries) =>
        (entries ?? [])
          .filter((entry) => entry.family === 'IPv4' && !entry.internal)
          .map((entry) => entry.address),
      ),
    ),
  ]
    .filter((address) =>
      /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address),
    )
    .sort(
      (a, b) =>
        Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')),
    )
    .slice(0, 2)
  const direct = ['udp:', 'tcp:'].flatMap((protocol) => {
    const listener = info.listeners.find((value) =>
      value.startsWith(`${protocol}//`),
    )
    if (!listener) return []
    const port = new URL(listener).port
    return port
      ? addresses.map((address) => `${protocol}//${address}:${port}`)
      : []
  })
  return [...new Set([...direct, ...peers])].slice(0, 10)
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
bind_device = false
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
${chain(
  1,
  options.secret
    ? rule(
        'eagle-read-only',
        `destination_ips = ["${HOST_IP}/32"]\nports = ["${SHARING_PORT}"]\nstateful = true`,
      )
    : '',
)}
${chain(
  2,
  options.secret
    ? rule(
        'eagle-response',
        `source_ips = ["${HOST_IP}/32"]\nsource_ports = ["${SHARING_PORT}"]`,
      ) +
        // 固定版本核心先检查出站 ACL，再按已建立的 NAT 映射还原响应。
        // 仅放行内部栈的固定 TCP 代理端口；网络上仍为 HOST_IP:SHARING_PORT。
        rule(
          'eagle-smoltcp-response',
          'source_ips = ["192.88.99.254/32"]\nsource_ports = ["8899"]\ndestination_ips = ["10.127.62.0/24"]',
        )
    : rule(
        'eagle-request',
        `destination_ips = ["${HOST_IP}/32"]\nports = ["${SHARING_PORT}"]\nstateful = true`,
      ),
)}
${chain(3)}
`
  await fs.writeFile(configFile, config, { mode: 0o600 })
  const output = new CoreOutput([options.secret, options.credential])
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
      'warn',
    ],
    {
      cwd: directory,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnvironment(),
    },
  )
  output.attach(child.stdout)
  output.attach(child.stderr)
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
    output,
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
    let startupError: unknown
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      if (spawnFailed || watcherError || child.exitCode !== null)
        throw new Error(output.message() || 'EasyTier 核心启动失败')
      try {
        await command(core, ['node'])
        if (forwardPort) await forwardReady(forwardPort)
        return core
      } catch (error) {
        startupError = error
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
    throw new Error(
      output.message() ||
        (startupError instanceof Error
          ? startupError.message
          : 'EasyTier 核心启动超时'),
    )
  } catch (error) {
    await core.stop()
    throw error
  }
}
