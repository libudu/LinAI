/** 库访问的内部基础设施：路径、格式约束、写锁与变更资源注册。 */
import path from 'path'
import { changeBus } from '../../../common/storage/change-bus'
import { dataPath } from '../../../common/storage/data-path'
import { resourceLock } from '../../../common/storage/resource-lock'

/** 支持通过 HTML5 video 播放的视频扩展名集合 */
export const VIDEO_EXTS = new Set([
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'flv',
  'm4v',
])

/** Eagle 条目唯一标识格式正则（字母数字组成） */
export const ITEM_ID_PATTERN = /^[A-Za-z0-9]+$/

/** 全量扫描时并发读 metadata.json 的并发度 */
export const SCAN_CONCURRENCY = 32

/** 缩略图缓存路径 */
export const THUMB_DIR = dataPath('eagle', 'thumb')

/** 索引分片缓存常量与目录路径 */
export const SHARD_COUNT = 32
export const INDEX_SHARDS_DIR = dataPath('eagle', 'index-shards')
export const INDEX_META_FILE = path.join(INDEX_SHARDS_DIR, 'meta.json')

/** 库写操作成功后发布变更。 */
export const EAGLE_LIBRARY_RESOURCE = 'eagle.library'
changeBus.register(EAGLE_LIBRARY_RESOURCE)

/** 获取指定 Eagle 库下的 images 目录绝对路径 */
export const imagesDir = (libraryPath: string) =>
  path.join(libraryPath, 'images')

/** 判断指定扩展名是否属于视频文件 */
export const isVideoExt = (ext: string) => VIDEO_EXTS.has(ext)

/** 条目名即文件名：去掉 Windows 文件名非法字符与首尾空白/点号，限制最大长度 120 字符 */
export const sanitizeItemName = (name: string): string =>
  name
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/, '')
    .slice(0, 120)
    .trim()

/** Eagle 资源库操作互斥锁：确保对同一资源库的写操作与增量校验串行执行 */
export const withLibraryLock = <T>(
  libraryPath: string,
  action: () => Promise<T>,
): Promise<T> => {
  return resourceLock.run(`eagle.library:${libraryPath}`, action)
}

/**
 * 基于字符串 Hash 的均匀分片算法：
 * 将条目 ID 均匀散列到 32 个分片之一（'00' ~ '1f'），无论 Eagle ID 前缀为何，尽量均匀分布
 */
export const getShardKey = (id: string): string => {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  const shard = Math.abs(hash) % SHARD_COUNT
  return shard.toString(16).padStart(2, '0')
}
