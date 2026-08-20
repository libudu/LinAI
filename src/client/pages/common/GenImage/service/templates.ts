import { collectionClient } from '@/client/service/storage'
import type { FlatTemplate, TemplateValue } from '@/shared/image/template'
import type { StoredItem } from '@/shared/storage/types'

/**
 * 图片模板业务封装：通用集合 image.templates 的业务字段由前端定义。
 * 对外暴露扁平结构（FlatTemplate + 信封元数据），内部负责与信封互转。
 */

export type TemplateRecord = FlatTemplate & {
  /** 条目版本，仅用于展示与调试 */
  revision: number
  updatedAt: number
  /** 集合版本，更新时作为 expectedRevision 做冲突检测 */
  collectionRevision?: number
}

const client = collectionClient<TemplateValue>('image.templates')

const flatten = (
  item: StoredItem<TemplateValue>,
  collectionRevision?: number,
): TemplateRecord => ({
  id: item.id,
  createdAt: item.createdAt,
  revision: item.revision,
  updatedAt: item.updatedAt,
  collectionRevision,
  ...item.value,
})

// 从扁平结构提取业务字段（剥离信封元数据）
export const pickTemplateValue = (t: FlatTemplate): TemplateValue => ({
  title: t.title,
  images: t.images || [],
  prompt: t.prompt,
  aspectRatio: t.aspectRatio,
  folder: t.folder,
  n: t.n,
})

export const listTemplates = async (): Promise<{
  revision: number
  templates: TemplateRecord[]
}> => {
  const { revision, items } = await client.list()
  return {
    revision,
    templates: items.map((item) => flatten(item, revision)),
  }
}

export const createTemplate = (value: TemplateValue) =>
  client.create(value).then(flatten)

export const updateTemplate = (
  id: string,
  value: TemplateValue,
  expectedRevision?: number,
) => client.replace(id, value, expectedRevision).then(flatten)

/** 基于已有记录做部分修改：合并业务字段后整体替换（带上集合版本做冲突检测） */
export const patchTemplate = (
  record: FlatTemplate & { collectionRevision?: number },
  patch: Partial<TemplateValue>,
) =>
  updateTemplate(
    record.id,
    { ...pickTemplateValue(record), ...patch },
    record.collectionRevision,
  )

export const deleteTemplate = (id: string) => client.remove(id)

/** 文件夹重命名：前端计算受影响的条目，一次批量提交（带集合版本冲突检测） */
export const renameTemplateFolder = async (
  oldFolder: string,
  newFolder: string,
): Promise<number> => {
  const { revision, items } = await client.list()
  const operations = items
    .filter((i) => i.value.folder === oldFolder)
    .map((i) => ({
      type: 'replace' as const,
      id: i.id,
      value: { ...i.value, folder: newFolder },
    }))
  if (operations.length === 0) return 0
  await client.batch(operations, revision)
  return operations.length
}
