import type { TemplateValue } from '@/shared/image/template'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '../../common/static/enum'
import { activeGeneratedFiles } from '../../common/static/image-lifecycle'
import { storageRegistry } from '../../common/storage/registry'
import { taskService } from '../../common/task'
// 图片引用规则只需本模块的存储资源，基础文件层不负责业务注册。
import './storage'

export function imageFilename(
  type: 'input' | 'generated',
  url: string,
): string | undefined {
  const base =
    type === 'input' ? INPUT_IMAGES_API_PATH : GENERATED_IMAGES_API_PATH
  const normalized = url
    .replace(/^https?:\/\/[^/]+/i, '')
    .split('?')[0]
    .split('#')[0]
  if (!normalized.startsWith(`${base}/`)) return undefined
  const filename = normalized.slice(base.length + 1)
  return /^[a-z0-9_-]+\.(?:png|webp|jpe?g)$/i.test(filename)
    ? filename
    : undefined
}

/** 图片业务的引用规则；前端图库和实际清理都使用这份结果。 */
export async function getImageReferences() {
  const [templates, pending, tasks] = await Promise.all([
    storageRegistry
      .getCollection<TemplateValue>('image.templates')
      .getSnapshot(),
    storageRegistry
      .getCollection<{ url: string }>('image.pending')
      .getSnapshot(),
    taskService.getTasks(),
  ])
  const input = new Set<string>()
  const generated = new Set(activeGeneratedFiles)
  const add = (type: 'input' | 'generated', urls: unknown) => {
    if (!Array.isArray(urls)) return
    for (const url of urls) {
      if (typeof url !== 'string') continue
      const filename = imageFilename(type, url)
      if (filename) (type === 'input' ? input : generated).add(filename)
    }
  }
  for (const item of templates.items) add('input', item.value.images)
  for (const item of pending.items) add('input', [item.value.url])
  for (const task of tasks) {
    add('input', task.inputSnapshot?.images)
    add(
      'generated',
      task.outputUrls?.length ? task.outputUrls : [task.outputUrl],
    )
  }
  return { input, generated }
}
