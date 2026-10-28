import { dataPath } from '@/server/common/storage/data-path'
import { DocumentStore } from '@/server/common/storage/document-store'
import { StorageError } from '@/server/common/storage/errors'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type { StoredDocument } from '@/shared/storage/types'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { EagleError } from '../errors'
import type { EagleRawFolder } from './types'

const originSchema = z.object({
  libraryId: z.string().uuid(),
  folderId: z.string().min(1),
})
export const downloadFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  parentId: z.string().nullable(),
  origins: z.array(originSchema).optional(),
})
type Folder = z.infer<typeof downloadFolderSchema>
type Origin = z.infer<typeof originSchema>
type Manifest = { libraryId?: string; folders: Folder[] }

const stateSchema = z.object({
  libraryId: z.string().uuid(),
  origins: z.record(z.string(), z.array(originSchema)),
})
type State = z.infer<typeof stateSchema>
const states = new Map<string, Promise<StoredDocument<State>>>()
const stateFile = (libraryPath: string) =>
  dataPath(
    'eagle',
    'sharing',
    'folder-mappings',
    `${createHash('sha256').update(path.resolve(libraryPath).toLowerCase()).digest('hex')}.json`,
  )
const stateStore = (file: string) =>
  new DocumentStore<State>(file, { maxValueLength: 16 * 1024 * 1024 })

function readState(file: string) {
  let pending = states.get(file)
  if (!pending) {
    pending = (async () => {
      const store = stateStore(file)
      const doc = await store.get()
      if (doc.value === undefined)
        return store.replace({ libraryId: randomUUID(), origins: {} }, doc.revision)
      const parsed = stateSchema.safeParse(doc.value)
      if (!parsed.success)
        throw new StorageError('CORRUPT', 'Eagle 下载目录映射格式不正确')
      return { ...doc, value: parsed.data }
    })()
    // 读取失败保留失败状态，不能将隔离后的损坏文件再次当成新库初始化。
    states.set(file, pending)
  }
  return pending
}

export const getDownloadFolderState = async (libraryPath: string) =>
  (await readState(stateFile(libraryPath))).value

const originKey = (origin: Origin) =>
  JSON.stringify([origin.libraryId, origin.folderId])
const uniqueOrigins = (origins: Origin[]) =>
  [...new Map(origins.map((origin) => [originKey(origin), origin])).values()]

/** 只携带不含路径的来源身份，授权投影后的目录不会泄露隐藏祖先名称。 */
export function downloadFolderOrigins(
  manifest: Pick<Manifest, 'libraryId'>,
  folder: Folder,
) {
  return uniqueOrigins([
    ...(manifest.libraryId
      ? [{ libraryId: manifest.libraryId, folderId: folder.id }]
      : []),
    ...(folder.origins ?? []),
  ])
}

export async function rememberDownloadFolders(
  libraryPath: string,
  entries: Array<{ localId: string; origins: Origin[] }>,
) {
  const file = stateFile(libraryPath)
  return resourceLock.run(`eagle.folder-mappings:${file}`, async () => {
    const doc = await readState(file)
    const origins = { ...doc.value.origins }
    let changed = false
    for (const entry of entries) {
      const previous = origins[entry.localId] ?? []
      const merged = uniqueOrigins([...previous, ...entry.origins]).filter(
        (origin) =>
          origin.libraryId !== doc.value.libraryId ||
          origin.folderId !== entry.localId,
      )
      if (JSON.stringify(previous) !== JSON.stringify(merged)) {
        origins[entry.localId] = merged
        changed = true
      }
    }
    if (!changed) return
    const saved = await stateStore(file).replace(
      { ...doc.value, origins },
      doc.revision,
    )
    states.set(file, Promise.resolve(saved))
  })
}

export function manifestFolders(folders: EagleRawFolder[], state: State): Folder[] {
  const result: Folder[] = []
  const visit = (nodes: EagleRawFolder[], parentId: string | null) => {
    for (const folder of nodes) {
      result.push({
        id: folder.id,
        name: folder.name,
        description: folder.description ?? '',
        parentId,
        origins: state.origins[folder.id],
      })
      visit(folder.children ?? [], folder.id)
    }
  }
  visit(folders, null)
  return result
}

/** 用目录名数组比较完整路径，避免目录名中含斜线时发生碰撞。 */
export function downloadFolderPaths(folders: Folder[]) {
  const nodes = new Map(folders.map((folder) => [folder.id, folder]))
  const result = new Map<string, string>()
  const resolve = (folderId: string, visiting = new Set<string>()): string[] => {
    const folder = nodes.get(folderId)
    if (!folder || visiting.has(folderId)) throw new Error('远程文件夹结构无效')
    visiting.add(folderId)
    return [
      ...(folder.parentId ? resolve(folder.parentId, visiting) : []),
      folder.name,
    ]
  }
  for (const folder of folders)
    result.set(folder.id, JSON.stringify(resolve(folder.id)))
  return result
}

/** 比较与锁内写入共用；先匹配身份再解析父目录，避免反向同步创建无用祖先。 */
export function createDownloadFolderMapping(remote: Manifest, local: Manifest) {
  const remoteNodes = new Map(remote.folders.map((folder) => [folder.id, folder]))
  const localNodes = new Map(local.folders.map((folder) => [folder.id, folder]))
  const remotePaths = downloadFolderPaths(remote.folders)
  const localPaths = downloadFolderPaths(local.folders)
  const origins = new Map<string, Set<string>>()
  const paths = new Map<string, Set<string>>()
  const children = new Map<string, Set<string>>()
  const remotePathIds = new Map<string, Set<string>>()
  const remoteChildren = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    const ids = map.get(key) ?? new Set<string>()
    ids.add(id)
    map.set(key, ids)
  }
  for (const folder of local.folders) {
    for (const origin of downloadFolderOrigins(local, folder))
      add(origins, originKey(origin), folder.id)
    add(paths, localPaths.get(folder.id)!, folder.id)
    add(children, JSON.stringify([folder.parentId, folder.name]), folder.id)
  }
  for (const folder of remote.folders) {
    add(remotePathIds, remotePaths.get(folder.id)!, folder.id)
    add(remoteChildren, JSON.stringify([folder.parentId, folder.name]), folder.id)
  }
  const unique = (ids: Set<string> | undefined) => {
    if (ids && ids.size > 1)
      throw new EagleError(
        'FOLDER_MAPPING_CONFLICT',
        409,
        '目录映射存在歧义，请检查重复目录后重试',
      )
    return ids?.values().next().value
  }
  const mapped = new Map<string, string | undefined>()
  const resolve = (folderId: string): string | undefined => {
    if (mapped.has(folderId)) return mapped.get(folderId)
    const folder = remoteNodes.get(folderId)
    if (!folder) throw new Error('远程文件夹不存在')
    const candidates = new Set<string>()
    for (const origin of downloadFolderOrigins(remote, folder))
      for (const id of origins.get(originKey(origin)) ?? []) candidates.add(id)
    let localId = unique(candidates)
    // 兼容未记录来源的旧下载：同步保留的同 ID 且同名目录可跨层级复用。
    if (!localId && localNodes.get(folderId)?.name === folder.name)
      localId = folderId
    if (!localId && folder.parentId) {
      const parentId = resolve(folder.parentId)
      if (parentId) {
        localId = unique(children.get(JSON.stringify([parentId, folder.name])))
        if (localId)
          unique(remoteChildren.get(JSON.stringify([folder.parentId, folder.name])))
        mapped.set(folderId, localId)
        return localId
      }
    }
    if (!localId) {
      const path = remotePaths.get(folderId)!
      localId = unique(paths.get(path))
      if (localId) unique(remotePathIds.get(path))
    }
    mapped.set(folderId, localId)
    return localId
  }
  return {
    resolve,
    bind: (remoteId: string, localId: string) => mapped.set(remoteId, localId),
  }
}
