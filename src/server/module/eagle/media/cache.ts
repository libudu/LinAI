import { dataPath } from '@/server/common/storage/data-path'
import path from 'path'

/** Eagle 回退缩略图只写应用数据目录；生成和删除共用同一路径定义。 */
export const THUMB_DIR = dataPath('eagle', 'thumb')
export const THUMB_SIZE = 200
export const thumbnailCachePath = (id: string, version?: string) =>
  path.join(THUMB_DIR, `${id}${version ? `-${version}` : ''}.webp`)
