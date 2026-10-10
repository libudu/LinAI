/** 可重建的 32 分片索引缓存：脏分片局部保存，5 秒防抖。 */
import fs from 'fs-extra'
import path from 'path'
import { writeJsonFile } from '../../../common/storage/json-file'
import { runPool } from '../concurrency'
import {
  getShardKey,
  INDEX_META_FILE,
  INDEX_SHARDS_DIR,
  SHARD_COUNT,
} from './runtime'
import { indexElapsed, indexNow } from './timing'
import type {
  EagleIndexShardMeta,
  EagleIndexState,
  EagleItemIndex,
} from './types'

const shardKeys = () =>
  Array.from({ length: SHARD_COUNT }, (_, i) => i.toString(16).padStart(2, '0'))

export class IndexShardCache {
  private readonly dirtyShards = new Set<string>()
  private writePromise: Promise<void> | null = null
  private pendingWrite = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly getState: () => EagleIndexState | null) {}

  markDirty(ids: string[]) {
    for (const id of ids) this.dirtyShards.add(getShardKey(id))
  }

  markAllDirty() {
    for (const key of shardKeys()) this.dirtyShards.add(key)
  }

  async persist(immediate = false): Promise<void> {
    if (immediate) return this.flush()
    if (this.dirtyShards.size === 0) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush().catch((error) =>
        console.error('[Eagle] 索引分片缓存后台落盘失败', error),
      )
    }, 5000)
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.writePromise) {
      this.pendingWrite = true
      return this.writePromise
    }
    const write = async () => {
      do {
        this.pendingWrite = false
        const state = this.getState()
        if (!state) return
        const keys = [...this.dirtyShards]
        // 无变化时不遍历整个索引，也不重写缓存元信息。
        if (keys.length === 0) continue
        const startedAt = indexNow()
        this.dirtyShards.clear()
        try {
          await fs.ensureDir(INDEX_SHARDS_DIR)
          const buckets = new Map(
            keys.map((key) => [key, [] as EagleItemIndex[]]),
          )
          for (const item of state.items.values())
            buckets.get(getShardKey(item.id))?.push(item)
          await runPool(keys, 16, async (key) => {
            await writeJsonFile(
              path.join(INDEX_SHARDS_DIR, `${key}.json`),
              buckets.get(key),
              { backup: false },
            )
          })
          const meta: EagleIndexShardMeta = {
            libraryPath: state.libraryPath,
            scannedAt: Date.now(),
            shardCount: SHARD_COUNT,
          }
          await writeJsonFile(INDEX_META_FILE, meta, { backup: false })
          console.log(
            `[Eagle] 索引缓存落盘：${indexElapsed(startedAt)}，${keys.length} / ${SHARD_COUNT} 个分片`,
          )
        } catch (error) {
          // 失败后保留脏标记供下次重试；正在写入期间的新变更也保留。
          for (const key of keys) this.dirtyShards.add(key)
          throw error
        }
      } while (this.pendingWrite)
    }
    this.writePromise = write().finally(() => {
      this.writePromise = null
    })
    return this.writePromise
  }
}

/** 尝试从本地分片缓存 (data/eagle/index-shards/) 快速恢复索引 */
export const loadIndexCache = async (
  libraryPath: string,
): Promise<EagleIndexState | null> => {
  try {
    const metaExists = await fs.pathExists(INDEX_META_FILE)
    if (metaExists) {
      const meta = (await fs.readJson(INDEX_META_FILE)) as EagleIndexShardMeta
      if (meta.libraryPath === libraryPath && meta.shardCount === SHARD_COUNT) {
        const shardKeys = Array.from({ length: SHARD_COUNT }, (_, i) =>
          i.toString(16).padStart(2, '0'),
        )
        const items = new Map<string, EagleItemIndex>()
        await runPool(shardKeys, 16, async (shardKey) => {
          const shardPath = path.join(INDEX_SHARDS_DIR, `${shardKey}.json`)
          try {
            if (await fs.pathExists(shardPath)) {
              const shardItems = (await fs.readJson(
                shardPath,
              )) as EagleItemIndex[]
              if (Array.isArray(shardItems)) {
                for (const item of shardItems) {
                  if (item?.id) items.set(item.id, item)
                }
              }
            }
          } catch {
            // 单个分片损坏容错
          }
        })
        return { libraryPath, folders: [], items }
      }
    }
  } catch (error) {
    console.warn('[Eagle] 读取分片索引缓存失败', error)
  }

  return null
}
