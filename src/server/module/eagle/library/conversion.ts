import { writeJsonFile } from '@/server/common/storage/json-file'
import { createHash, randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { EagleError } from '../errors'
import { encodeStaticHeif } from '../media/heic'
import { getEagleSettings } from '../settings'
import { collectFolderPaths } from './folders'
import { ensureIndex, indexCache, libraryChanges } from './index-state'
import { updateMtimes } from './mtime-state'
import { withLibraryMutation } from './mutation'
import { toEagleItem } from './query'
import { ITEM_ID_PATTERN } from './runtime'
import type { EagleIndexState, EagleItemIndex, EagleRawItemMeta } from './types'

const isHeif = (ext: string) => ['heic', 'heif'].includes(ext.toLowerCase())
const libraryIdentity = (libraryPath: string) =>
  createHash('sha256')
    .update(path.resolve(libraryPath).toLowerCase())
    .digest('hex')
function conflict(message: string): never {
  throw new EagleError('CONVERSION_CONFLICT', 409, message)
}

type ConversionCandidate = Pick<
  ReturnType<typeof toEagleItem>,
  'id' | 'name' | 'ext' | 'contentVersion'
> & { folderPaths: string[] }

const assertLibrary = async (index: EagleIndexState, identity: string) => {
  const configured = (await getEagleSettings()).libraryPath
  if (
    !configured ||
    libraryIdentity(configured) !== identity ||
    libraryIdentity(index.libraryPath) !== identity ||
    (await ensureIndex()) !== index
  )
    throw new EagleError(
      'LIBRARY_CHANGED',
      409,
      '资源库已切换，请重新查询待转换图片',
    )
}

/** 不跟随库内符号链接或 junction；每个文件都必须是当前条目目录的直接子文件。 */
const itemPaths = async (index: EagleIndexState, entry: EagleItemIndex) => {
  const root = path.resolve(index.libraryPath)
  const images = path.join(root, 'images')
  const dir = path.join(images, `${entry.id}.info`)
  for (const directory of [root, images, dir]) {
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      conflict('转换目录包含链接或不是普通目录')
  }
  const realRoot = await fs.realpath(root)
  if (
    path.relative(realRoot, await fs.realpath(dir)).toLowerCase() !==
    path.join('images', `${entry.id}.info`).toLowerCase()
  )
    conflict('条目目录不在绑定的资源库内')
  const child = (name: string) => {
    if (!name || path.basename(name) !== name || /[\\/:*?"<>|]/.test(name))
      conflict('条目文件名无效')
    const file = path.join(dir, name)
    if (path.dirname(file) !== dir) conflict('条目文件路径越界')
    return file
  }
  if (!isHeif(path.extname(entry.fileName).slice(1)))
    conflict('索引中的源文件不是 HEIC/HEIF')
  return {
    dir,
    source: child(entry.fileName),
    target: child(`${entry.name}.webp`),
    meta: child('metadata.json'),
  }
}

const regularStat = async (file: string) => {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink())
    conflict('转换文件不是普通文件或包含链接')
  return stat
}
const sameFile = (a: Stats, b: Stats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs &&
  a.birthtimeMs === b.birthtimeMs
const sameInode = (a: Stats, b: Stats) =>
  a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs
const assertAbsent = async (file: string) => {
  try {
    await fs.lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  conflict('同名 WebP 已存在，未覆盖任何文件')
}

/** 全库快照，不接收文件夹参数。分页展示与批量 ID 快照使用同一候选集合。 */
export const getConversionCandidates = async (
  offset: number,
  limit: number,
  snapshot: boolean,
) => {
  const index = await ensureIndex()
  if (!index)
    return {
      libraryId: '',
      total: 0,
      items: [],
      ids: [] as string[],
      snapshotItems: [] as ConversionCandidate[],
    }
  const libraryId = libraryIdentity(index.libraryPath)
  await assertLibrary(index, libraryId)
  const candidates = [...index.items.values()].filter(
    (item) => !item.isDeleted && isHeif(item.ext),
  )
  // 全库批量快照只构建一次目录映射，避免逐张重复遍历目录树。
  const folderEntries = collectFolderPaths(index.folders, 'preorder')
  const folderPathsById = new Map(
    folderEntries.map(({ folder, folderPath }) => [folder.id, folderPath]),
  )
  const folderOrderById = new Map(
    folderEntries.map(({ folder }, order) => [folder.id, order]),
  )
  // 多目录条目按最靠前的归属目录排序；无有效归属排最后，同目录保持原条目顺序。
  const candidateOrder = new Map(
    candidates.map((item) => [
      item.id,
      item.folders.reduce(
        (order, id) =>
          Math.min(order, folderOrderById.get(id) ?? folderEntries.length),
        folderEntries.length,
      ),
    ]),
  )
  candidates.sort(
    (a, b) => candidateOrder.get(a.id)! - candidateOrder.get(b.id)!,
  )
  const getFolderPaths = (entry: EagleItemIndex) =>
    entry.folders.flatMap((id) => {
      const folderPath = folderPathsById.get(id)
      return folderPath ? [folderPath] : []
    })
  return {
    libraryId,
    total: candidates.length,
    items: candidates.slice(offset, offset + limit).map((entry) => ({
      ...toEagleItem(entry, index.libraryPath),
      folderPaths: getFolderPaths(entry),
    })),
    ids: snapshot ? candidates.map((item) => item.id) : [],
    snapshotItems: snapshot
      ? candidates.map((entry) => {
          const { id, name, ext, contentVersion } = toEagleItem(
            entry,
            index.libraryPath,
          )
          return {
            id,
            name,
            ext,
            contentVersion,
            folderPaths: getFolderPaths(entry),
          }
        })
      : [],
  }
}

// 仅防止同一条目重复请求；不保存队列、任务或恢复状态。
const converting = new Set<string>()

interface RetainedSource {
  entry: EagleItemIndex
  paths: Awaited<ReturnType<typeof itemPaths>>
  sourceStat: Stats
  outputStat: Stats
  outputHash: string
  metadata: string
  committedVersion: number
}
// 仅保存删除失败的操作凭据，便于当前会话重试；不是持久化任务或转换队列。
const retainedSources = new Map<string, RetainedSource>()
const removeConvertedSource = async (
  index: EagleIndexState,
  libraryId: string,
  receipt: RetainedSource,
) => {
  const { entry, paths, sourceStat, outputStat } = receipt
  await assertLibrary(index, libraryId)
  const current = index.items.get(entry.id)
  if (
    !current ||
    current.isDeleted ||
    current.ext !== 'webp' ||
    current.fileName !== path.basename(paths.target) ||
    current.lastModified !== receipt.committedVersion
  )
    conflict('已转换条目又被修改，请刷新后检查保留的源文件')
  const checked = await itemPaths(index, entry)
  if (
    checked.source !== paths.source ||
    checked.target !== paths.target ||
    !sameFile(sourceStat, await regularStat(paths.source)) ||
    !sameInode(outputStat, await regularStat(paths.target)) ||
    JSON.stringify(JSON.parse(await fs.readFile(paths.meta, 'utf8'))) !==
      receipt.metadata ||
    createHash('sha256')
      .update(await fs.readFile(paths.target))
      .digest('hex') !== receipt.outputHash
  )
    conflict('删除前文件或元数据发生变化，源文件已保留')
  // 最后再核对一次源文件属性与绑定库，只删除可信索引解析的这一条路径。
  await assertLibrary(index, libraryId)
  if (!sameFile(sourceStat, await regularStat(paths.source)))
    conflict('源文件在删除前发生变化')
  await fs.unlink(paths.source)
}

const retainedWarning = (error: unknown) =>
  `WebP 已提交，但源文件保留：${error instanceof Error ? error.message : String(error)}。可重试删除源图；不会再次压缩 WebP。`

interface ConversionSnapshot {
  index: EagleIndexState
  entry: EagleItemIndex
  paths: Awaited<ReturnType<typeof itemPaths>>
  sourceStat: Stats
  metaStat: Stats
  metaText: string
  meta: EagleRawItemMeta
}
type ConversionResult = {
  item: ReturnType<typeof toEagleItem>
  sourceRemoved: boolean
  warning: string | null
}

export const convertHeifItem = async (id: string, libraryId: string) => {
  if (!ITEM_ID_PATTERN.test(id))
    throw new EagleError('INVALID_REQUEST', 400, '条目 ID 无效')
  const key = `${libraryId}:${id}`
  if (converting.has(key)) conflict('此条目正在转换，请等待当前请求完成')
  converting.add(key)
  let temporary: string | undefined
  let temporaryOwned = false
  let temporaryStat: Stats | undefined
  let checkTemporaryDirectory:
    | (() => Promise<Awaited<ReturnType<typeof itemPaths>>>)
    | undefined
  try {
    const receipt = retainedSources.get(key)
    if (receipt)
      return await withLibraryMutation<ConversionResult | null>(
        null,
        async (index) => {
          await assertLibrary(index, libraryId)
          let warning: string | null = null
          try {
            await removeConvertedSource(index, libraryId, receipt)
            retainedSources.delete(key)
          } catch (error) {
            warning = retainedWarning(error)
          }
          const entry = index.items.get(id)
          if (!entry) conflict('条目已不存在，请检查保留的源文件')
          return {
            item: toEagleItem(entry, index.libraryPath),
            sourceRemoved: warning === null,
            warning,
          }
        },
      )
    const snapshot = await withLibraryMutation<ConversionSnapshot | null>(
      null,
      async (index) => {
        await assertLibrary(index, libraryId)
        const entry = index.items.get(id)
        if (!entry || entry.id !== id || entry.isDeleted)
          conflict('条目已不存在或已移入回收站')
        if (!isHeif(entry.ext))
          conflict(
            '条目已不是 HEIC/HEIF；已提交的 WebP 不会再次压缩，请检查保留的源文件',
          )
        const paths = await itemPaths(index, entry)
        await assertAbsent(paths.target)
        const sourceStat = await regularStat(paths.source)
        const metaStat = await regularStat(paths.meta)
        const metaText = await fs.readFile(paths.meta, 'utf8')
        const meta = JSON.parse(metaText) as EagleRawItemMeta
        if (
          meta.id !== id ||
          meta.name !== entry.name ||
          meta.isDeleted ||
          meta.ext.toLowerCase() !== entry.ext.toLowerCase() ||
          meta.lastModified !== entry.lastModified
        )
          conflict('条目元数据与索引不一致，请刷新后重试')
        return {
          index,
          entry: { ...entry },
          paths,
          sourceStat,
          metaStat,
          metaText,
          meta,
        }
      },
    )
    if (!snapshot) conflict('Eagle 资源库当前不可用')
    const { index, entry, paths, sourceStat, metaStat, metaText, meta } =
      snapshot
    checkTemporaryDirectory = () => itemPaths(index, entry)
    const input = await fs.readFile(paths.source)
    if (!sameFile(sourceStat, await regularStat(paths.source)))
      conflict('源文件在读取期间变化，请刷新后重试')
    const { webp, width, height } = await encodeStaticHeif(input)
    temporary = path.join(paths.dir, `.linai-convert-${randomUUID()}.tmp`)
    const handle = await fs.open(temporary, 'wx')
    temporaryOwned = true
    try {
      temporaryStat = await handle.stat()
      await handle.writeFile(webp)
      await handle.sync()
    } finally {
      await handle.close()
    }
    // 从实际临时文件重新完整解码，不只验证编码器返回的 Buffer。
    // 读取实际文件再解码；避免 sharp 文件缓存在 Windows 上持有临时文件句柄。
    const verified = await sharp(await fs.readFile(temporary), {
      failOn: 'warning',
    })
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (verified.info.width !== width || verified.info.height !== height)
      throw new Error('临时 WebP 文件验证失败')
    // 条目排序使用 metadata.mtime；现有编辑会从原文件 stat 回填，输出文件时间也必须一致。
    await fs.utimes(temporary, sourceStat.atime, new Date(meta.mtime))
    const outputStat = await regularStat(temporary)
    const temp = temporary
    return await withLibraryMutation<ConversionResult | null>(
      null,
      async (current, changes) => {
        await assertLibrary(current, libraryId)
        if (
          current !== index ||
          JSON.stringify(current.items.get(id)) !== JSON.stringify(entry)
        )
          conflict('条目索引在转换期间变化，请刷新后重试')
        const checked = await itemPaths(current, entry)
        if (
          checked.source !== paths.source ||
          checked.target !== paths.target ||
          !sameFile(sourceStat, await regularStat(paths.source)) ||
          !sameFile(metaStat, await regularStat(paths.meta)) ||
          (await fs.readFile(paths.meta, 'utf8')) !== metaText
        )
          conflict('条目或源文件在转换期间变化，请刷新后重试')
        await assertAbsent(paths.target)
        if (!sameFile(outputStat, await regularStat(temp)))
          conflict('本次临时文件被修改，源文件已保留')
        let placed = false
        let metadataWritten = false
        const timestamp = Math.max(changes.timestamp, entry.lastModified + 1)
        changes.timestamp = timestamp
        const nextMeta = {
          ...meta,
          ext: 'webp',
          size: outputStat.size,
          width,
          height,
          lastModified: timestamp,
        }
        const nextEntry = {
          ...entry,
          ext: 'webp',
          fileName: path.basename(paths.target),
          size: outputStat.size,
          width,
          height,
          lastModified: timestamp,
        }
        try {
          // hard link 原子地拒绝已有目标；不使用会覆盖目标的 rename。
          await fs.link(temp, paths.target)
          placed = true
          await itemPaths(current, entry)
          if (
            !sameFile(sourceStat, await regularStat(paths.source)) ||
            (await fs.readFile(paths.meta, 'utf8')) !== metaText
          )
            conflict('放置 WebP 后条目发生变化，源文件已保留')
          await writeJsonFile(paths.meta, nextMeta, { backup: false })
          metadataWritten = true
          current.items.set(id, nextEntry)
          libraryChanges.changed(id)
          changes.updated.add(id)
          await updateMtimes(current.libraryPath, [id], timestamp, true)
          indexCache.markDirty([id])
          await indexCache.flush()
          changes.persisted = true
        } catch (error) {
          try {
            if (metadataWritten) {
              if (
                JSON.stringify(
                  JSON.parse(await fs.readFile(paths.meta, 'utf8')),
                ) !== JSON.stringify(nextMeta)
              )
                conflict(
                  '提交失败且元数据被外部修改，源图与生成的 WebP 均已保留，请刷新检查',
                )
              await writeJsonFile(paths.meta, meta, { backup: false })
              current.items.set(id, entry)
              libraryChanges.changed(id)
              changes.timestamp = entry.lastModified
              await updateMtimes(
                current.libraryPath,
                [id],
                entry.lastModified,
                true,
              )
              indexCache.markDirty([id])
              await indexCache.flush()
              changes.persisted = true
            }
            if (placed) {
              await itemPaths(current, entry)
              if (
                !sameInode(outputStat, await regularStat(paths.target)) ||
                createHash('sha256')
                  .update(await fs.readFile(paths.target))
                  .digest('hex') !==
                  createHash('sha256').update(webp).digest('hex')
              )
                conflict('生成的 WebP 已被外部修改，未清理该文件')
              await fs.unlink(paths.target)
            }
          } catch (rollbackError) {
            console.error('[Eagle] 格式转换回滚失败', rollbackError)
            throw new Error(
              '转换提交失败且未能完整回滚，源图已保留，请刷新资源库检查',
            )
          }
          if ((error as NodeJS.ErrnoException).code === 'EEXIST')
            conflict('同名 WebP 已存在，未覆盖任何文件')
          throw error
        }
        // 删除失败仍保留已提交的 WebP，不再次压缩；清楚报告源图保留。
        let warning: string | null = null
        const receipt: RetainedSource = {
          entry,
          paths,
          sourceStat,
          outputStat,
          outputHash: createHash('sha256').update(webp).digest('hex'),
          metadata: JSON.stringify(nextMeta),
          committedVersion: timestamp,
        }
        try {
          await removeConvertedSource(current, libraryId, receipt)
        } catch (error) {
          warning = retainedWarning(error)
          if (retainedSources.size >= 1000)
            retainedSources.delete(retainedSources.keys().next().value!)
          retainedSources.set(key, receipt)
        }
        return {
          item: toEagleItem(nextEntry, current.libraryPath),
          sourceRemoved: warning === null,
          warning,
        }
      },
    )
  } finally {
    converting.delete(key)
    if (
      temporaryOwned &&
      temporary &&
      temporaryStat &&
      checkTemporaryDirectory
    ) {
      try {
        const checked = await checkTemporaryDirectory()
        if (
          checked.dir === path.dirname(temporary) &&
          sameInode(temporaryStat, await regularStat(temporary))
        )
          await fs.unlink(temporary)
      } catch (error) {
        console.error('[Eagle] 本次转换临时文件清理失败', error)
      }
    }
  }
}
