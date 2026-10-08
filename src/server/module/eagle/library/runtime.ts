/** 库访问的内部基础设施：路径、格式约束、写锁与变更资源注册。 */
import {
  EAGLE_ITEM_NAME_MAX_LENGTH,
  type EagleMediaType,
} from '@/shared/eagle/types'
import path from 'path'
import { changeBus } from '../../../common/storage/change-bus'
import { dataPath } from '../../../common/storage/data-path'
import { resourceLock } from '../../../common/storage/resource-lock'

/** Eagle 视频条目的扩展名集合，具体播放能力由浏览器决定。 */
export const VIDEO_EXTS = new Set([
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'flv',
  'm4v',
  'wmv',
  'mpg',
  'mpeg',
  'm2v',
  'ts',
  'mts',
  'm2ts',
  '3gp',
  '3g2',
  'ogv',
  'vob',
  'rm',
  'rmvb',
])

/** 图片包含 GIF、矢量图、设计源图和 RAW，不把音频、文档等其他资源视为图片。 */
const IMAGE_EXTS = new Set([
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'png',
  'apng',
  'gif',
  'webp',
  'avif',
  'jxl',
  'bmp',
  'tif',
  'tiff',
  'svg',
  'ico',
  'icns',
  'heic',
  'heif',
  'psd',
  'psb',
  'ai',
  'eps',
  'raw',
  'dng',
  'cr2',
  'cr3',
  'crw',
  'nef',
  'nrw',
  'arw',
  'srf',
  'sr2',
  'raf',
  'orf',
  'rw2',
  'pef',
  'x3f',
])

/** Eagle 条目唯一标识格式正则（字母数字组成） */
export const ITEM_ID_PATTERN = /^[A-Za-z0-9]+$/

/** 全量扫描时并发读 metadata.json 的并发度 */
export const SCAN_CONCURRENCY = 32

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
export const isVideoExt = (ext: string) => VIDEO_EXTS.has(ext.toLowerCase())

/** 查询与批量操作共用媒体范围；未指定时保留全库查询。 */
export const matchesMediaType = (ext: string, mediaType?: EagleMediaType) =>
  !mediaType ||
  (mediaType === 'video' ? isVideoExt(ext) : IMAGE_EXTS.has(ext.toLowerCase()))

/** 条目名即文件名：去掉 Windows 文件名非法字符与首尾空白/点号，限制最大长度 120 字符 */
export const sanitizeItemName = (name: string): string =>
  name
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/, '')
    .slice(0, EAGLE_ITEM_NAME_MAX_LENGTH)
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
