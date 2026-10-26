import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import { dataPath } from '../storage/data-path'
import { DocumentStore } from '../storage/document-store'
import { StorageError } from '../storage/errors'

const store = new DocumentStore<string>(dataPath('system', 'auth-secret.json'))
let loading: Promise<string> | null = null

async function initializeSecret() {
  await fs.mkdir(dataPath('system'), { recursive: true })
  const lockFile = dataPath('system', 'auth-secret.init-lock')
  for (let attempt = 0; attempt < 1000; attempt++) {
    try {
      const lock = await fs.open(lockFile, 'wx')
      try {
        const current = await store.get()
        return current.value === undefined
          ? await store.replace(randomBytes(32).toString('hex'), 0)
          : current
      } finally {
        await lock.close()
        await fs.unlink(lockFile)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const current = await store.get()
      if (current.value !== undefined) return current
      try {
        if (Date.now() - (await fs.stat(lockFile)).mtimeMs > 30000)
          await fs.unlink(lockFile)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  throw new Error('初始化登录签名密钥超时，请稍后重试')
}

/** 签名密钥独立于用户可读写的设置，持久保存，使 30 天 Cookie 跨重启有效。 */
export function getAuthSecret(): Promise<string> {
  if (!loading)
    loading = (async () => {
      let document = await store.get()
      if (document.value === undefined) {
        document = await initializeSecret()
      }
      if (!document.value || !/^[a-f0-9]{64}$/.test(document.value))
        throw new StorageError('CORRUPT', '登录签名密钥格式不正确')
      return document.value
    })().catch((error) => {
      loading = null
      throw error
    })
  return loading
}
