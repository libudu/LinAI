import { settingsClient } from '@/client/service/settings'
import type {
  EagleManualFolderItem,
  EagleManualFoldersSettings,
} from '@/server/module/eagle/settings'
import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { DeleteOutlined, FolderAddOutlined } from '@ant-design/icons'
import { Button, Checkbox, Empty, Image, Radio, Spin, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteEagleItem, eagleFileUrl, eagleThumbnailUrl } from '../api'
import { confirmDeleteEagleItem } from '../components/confirmDeleteModal'
import {
  FolderSelectModal,
  type SelectedFolderInfo,
} from '../components/FolderSelectModal'
import {
  clearOrganizeResultClassification,
  confirmOrganizeResult,
  fetchOrganizeResult,
  fetchOrganizeResults,
  retryOrganizeResult,
  skipOrganizeResult,
} from './api'

const manualFoldersClient = settingsClient<EagleManualFoldersSettings>(
  'eagle-manual-folders',
)

// 步骤 3 结果确认：纯净查验判定成功的结果（status === 'success'）
// 顶部缩略图条 + 左大图右信息面板 + 底部操作（A/S/D 与重新执行）
// 完成当前结果后自动选中下一张；重新执行单图送回步骤 2 队列，步骤 3 继续确认下一张
export function StepConfirm({
  onSwitchToRunning,
}: {
  onSwitchToRunning?: () => void
}) {
  const [results, setResults] = useState<OrganizeResultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrganizeResultDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [manualFolders, setManualFolders] = useState<EagleManualFolderItem[]>(
    [],
  )
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)
  const manualRevisionRef = useRef<number | undefined>(undefined)
  const resultsRef = useRef<OrganizeResultListItem[]>([])
  const confirmingIdsRef = useRef(new Set<string>())
  const preloadedIdsRef = useRef(new Set<string>())
  const preloadImagesRef = useRef<HTMLImageElement[]>([])
  const [titleDisabledIds, setTitleDisabledIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<
    Record<string, string>
  >({})

  // 仅拉取判定成功的结果，按完成时间正序展示
  const refreshResults = useCallback(async (): Promise<
    OrganizeResultListItem[]
  > => {
    const succeeded = await fetchOrganizeResults('success')
    const pending = [...succeeded].sort((a, b) => a.updatedAt - b.updatedAt)
    resultsRef.current = pending
    setResults(pending)
    return pending
  }, [])

  // 仅在挂载时拉取一次；确认操作成功后在本地移除，避免每次 SSE 都重拉列表
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refreshResults()
      .then((pending) => {
        if (cancelled) return
        setSelectedId((prev) =>
          prev && pending.some((r) => r.itemId === prev)
            ? prev
            : (pending[0]?.itemId ?? null),
        )
      })
      .catch((error) => {
        console.error('拉取待确认结果失败', error)
        message.error('拉取待确认结果失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshResults])

  // 加载手动选择文件夹的历史记录
  useEffect(() => {
    let cancelled = false
    manualFoldersClient
      .get()
      .then((res) => {
        if (cancelled) return
        manualRevisionRef.current = res.revision
        setManualFolders(res.value.folders ?? [])
      })
      .catch((error) => {
        console.error('加载手动文件夹历史失败', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveManualFolders = useCallback(
    async (folders: EagleManualFolderItem[]) => {
      try {
        const res = await manualFoldersClient.put(
          { folders },
          manualRevisionRef.current,
        )
        manualRevisionRef.current = res.revision
        setManualFolders(res.value.folders ?? [])
      } catch (error) {
        console.error('保存手动文件夹历史失败', error)
      }
    },
    [],
  )

  const handleManualFolderSelect = useCallback(
    (folder: SelectedFolderInfo) => {
      const existing = manualFolders.find((f) => f.folderId === folder.id)
      if (!existing) {
        const next = [
          ...manualFolders,
          { folderId: folder.id, folderPath: folder.path, count: 0 },
        ]
        setManualFolders(next)
        void saveManualFolders(next)
      }
      if (selectedId) {
        setSelectedOptionKeys((current) => ({
          ...current,
          [selectedId]: `manual:${folder.id}`,
        }))
      }
    },
    [manualFolders, saveManualFolders, selectedId],
  )

  const handleRemoveManualFolder = useCallback(
    (target: EagleManualFolderItem) => {
      const next = manualFolders.filter((f) => f.folderId !== target.folderId)
      setManualFolders(next)
      void saveManualFolders(next)
      if (
        selectedId &&
        selectedOptionKeys[selectedId] === `manual:${target.folderId}`
      ) {
        setSelectedOptionKeys((current) => {
          const copy = { ...current }
          delete copy[selectedId]
          return copy
        })
      }
    },
    [manualFolders, saveManualFolders, selectedId, selectedOptionKeys],
  )

  const sortedManualFolders = useMemo(
    () => [...manualFolders].sort((a, b) => b.count - a.count),
    [manualFolders],
  )

  // 预加载接下来两张原图（已加载过的自动跳过，避免重复发起请求）
  useEffect(() => {
    if (!selectedId || results.length === 0) return
    preloadedIdsRef.current.add(selectedId)
    const currentIndex = results.findIndex((item) => item.itemId === selectedId)
    if (currentIndex === -1) return
    const nextItems = results.slice(currentIndex + 1, currentIndex + 3)
    nextItems.forEach((item) => {
      if (!preloadedIdsRef.current.has(item.itemId)) {
        preloadedIdsRef.current.add(item.itemId)
        const img = new window.Image()
        img.src = eagleFileUrl(item.itemId)
        preloadImagesRef.current.push(img)
        if (preloadImagesRef.current.length > 20) {
          preloadImagesRef.current.shift()
        }
      }
    })
  }, [selectedId, results])

  // 选中项变化时拉取详情
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    fetchOrganizeResult(selectedId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((error) => {
        console.error('拉取结果详情失败', error)
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const folderPaths = detail?.folderPaths ?? []

  // 若手动选择的文件夹已出现在当前图片的 AI 推荐选项中，则不在下方重复展示
  const displayedManualFolders = useMemo(() => {
    const aiPathSet = new Set(folderPaths)
    return sortedManualFolders.filter((m) => !aiPathSet.has(m.folderPath))
  }, [folderPaths, sortedManualFolders])

  // 当前选中项的唯一 key（例如 "ai:角色/插画" 或 "manual:folderId"）
  const activeOptionKey = selectedId
    ? (selectedOptionKeys[selectedId] ??
      (folderPaths[0] ? `ai:${folderPaths[0]}` : null))
    : null

  const selectedManualFolder = useMemo(() => {
    if (!activeOptionKey?.startsWith('manual:')) return null
    const folderId = activeOptionKey.slice('manual:'.length)
    return manualFolders.find((f) => f.folderId === folderId) ?? null
  }, [activeOptionKey, manualFolders])

  const selectedFolderPath = useMemo(() => {
    if (!activeOptionKey) return null
    if (activeOptionKey.startsWith('ai:')) {
      return activeOptionKey.slice('ai:'.length)
    }
    if (activeOptionKey.startsWith('manual:')) {
      return selectedManualFolder?.folderPath ?? null
    }
    return null
  }, [activeOptionKey, selectedManualFolder])

  const canConfirm = detail?.status === 'success' && !!selectedFolderPath
  const withTitle = selectedId ? !titleDisabledIds.has(selectedId) : true

  const runAction = useCallback(
    async (fn: (itemId: string) => Promise<void>) => {
      if (!selectedId || actionLoading) return
      const itemId = selectedId
      setActionLoading(true)
      try {
        await fn(itemId)
        const current = resultsRef.current
        const index = current.findIndex((result) => result.itemId === itemId)
        const remaining = current.filter((result) => result.itemId !== itemId)
        const nextId = remaining[index]?.itemId ?? remaining[0]?.itemId ?? null
        resultsRef.current = remaining
        setResults(remaining)
        setSelectedId(nextId)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '操作失败')
      } finally {
        setActionLoading(false)
      }
    },
    [actionLoading, selectedId],
  )

  const runConfirm = useCallback(async () => {
    if (
      !selectedId ||
      !selectedFolderPath ||
      !canConfirm ||
      actionLoading ||
      confirmingIdsRef.current.has(selectedId)
    ) {
      return
    }

    const itemId = selectedId
    const item = results.find((result) => result.itemId === itemId)
    if (!item) return

    const index = results.findIndex((result) => result.itemId === itemId)
    const remaining = results.filter((result) => result.itemId !== itemId)
    const nextId = remaining[index]?.itemId ?? remaining[0]?.itemId ?? null
    const isLast = remaining.length === 0
    confirmingIdsRef.current.add(itemId)

    // 检查是否为手动选择的文件夹，如果是则计数 +1 并持久化
    if (selectedManualFolder) {
      const nextManuals = manualFolders.map((f) =>
        f.folderId === selectedManualFolder.folderId
          ? { ...f, count: f.count + 1 }
          : f,
      )
      setManualFolders(nextManuals)
      void saveManualFolders(nextManuals)
    }

    // 非最后一张立即切换，确认请求留在后台执行，不阻塞继续处理
    if (isLast) {
      setActionLoading(true)
    } else {
      resultsRef.current = remaining
      setResults(remaining)
      setSelectedId(nextId)
    }

    try {
      await confirmOrganizeResult(
        itemId,
        selectedFolderPath,
        withTitle,
        selectedManualFolder?.folderId,
      )
      if (isLast) {
        const current = resultsRef.current.filter(
          (result) => result.itemId !== itemId,
        )
        resultsRef.current = current
        setResults(current)
        setSelectedId(current[0]?.itemId ?? null)
      }
    } catch (error) {
      if (!isLast) {
        const current = resultsRef.current
        if (!current.some((result) => result.itemId === itemId)) {
          const restored = [...current]
          restored.splice(Math.min(index, restored.length), 0, item)
          resultsRef.current = restored
          setResults(restored)
          setSelectedId((curr) => curr ?? itemId)
        }
      }
      message.error(error instanceof Error ? error.message : '确认失败')
    } finally {
      confirmingIdsRef.current.delete(itemId)
      if (isLast) setActionLoading(false)
    }
  }, [
    actionLoading,
    canConfirm,
    manualFolders,
    results,
    saveManualFolders,
    selectedFolderPath,
    selectedId,
    selectedManualFolder,
    withTitle,
  ])

  const handleDelete = useCallback(() => {
    if (!selectedId || actionLoading) return
    confirmDeleteEagleItem({
      name: detail?.itemName,
      onConfirm: () =>
        runAction(async (itemId) => {
          await deleteEagleItem(itemId)
          await skipOrganizeResult(itemId)
          message.success('已移至回收站')
        }),
    })
  }, [actionLoading, detail?.itemName, runAction, selectedId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target instanceof HTMLInputElement &&
            !['radio', 'checkbox'].includes(target.type)))
      ) {
        return
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault()
        void runAction(clearOrganizeResultClassification)
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void runAction(skipOrganizeResult)
      } else if (event.key.toLowerCase() === 'd') {
        event.preventDefault()
        void runConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runAction, runConfirm])

  if (loading && results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Empty description="暂无待确认结果" />
        {onSwitchToRunning && (
          <Button type="link" size="small" onClick={onSwitchToRunning}>
            返回步骤 02 查看队列进度
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 顶部待确认缩略图条 */}
      <div className="flex shrink-0 gap-2 overflow-x-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        {results.map((result) => (
          <button
            key={result.itemId}
            type="button"
            onClick={() => setSelectedId(result.itemId)}
            className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
              result.itemId === selectedId
                ? 'border-blue-500'
                : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <img
              src={eagleThumbnailUrl(result.itemId)}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* 中部：左大图 + 右信息面板 */}
      <div className="grid min-h-0 flex-1 grid-cols-[6fr_4fr] gap-3">
        <div className="flex h-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
          {selectedId && (
            <Image
              key={selectedId}
              src={eagleFileUrl(selectedId)}
              classNames={{
                root: 'h-full w-full flex items-center justify-center',
                image: 'h-full! w-full! object-contain!',
              }}
              preview={{ src: eagleFileUrl(selectedId) }}
            />
          )}
        </div>
        <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          {detailLoading || !detail ? (
            <div className="flex flex-1 items-center justify-center">
              <Spin />
            </div>
          ) : (
            <>
              {detail.lowQuality && (
                <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                  疑似低质图片（分辨率低、画面主体不清晰、美学品味较差等）
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div>
                  <div className="text-xs text-slate-400">原文件夹</div>
                  <div className="break-all">
                    {detail.itemFolderPaths.length > 0
                      ? detail.itemFolderPaths.join('、')
                      : '（未归入文件夹）'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">原标题</div>
                  <div className="break-all">
                    {detail.itemName ?? '（条目已不在库中）'}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">建议标题</div>
                <Checkbox
                  className="items-start"
                  checked={withTitle}
                  onChange={(event) => {
                    if (!selectedId) return
                    setTitleDisabledIds((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.delete(selectedId)
                      else next.add(selectedId)
                      return next
                    })
                  }}
                >
                  <span
                    className={`break-all transition-colors ${
                      withTitle ? '' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {detail.title}
                  </span>
                </Checkbox>
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-400">
                  选择目标文件夹
                </div>
                {folderPaths.length > 0 || displayedManualFolders.length > 0 ? (
                  <Radio.Group
                    value={activeOptionKey}
                    onChange={(event) => {
                      if (!selectedId) return
                      setSelectedOptionKeys((current) => ({
                        ...current,
                        [selectedId]: event.target.value,
                      }))
                    }}
                    className="flex w-full flex-col gap-1.5"
                  >
                    {folderPaths.map((folderPath) => (
                      <div key={`ai-${folderPath}`}>
                        <Radio value={`ai:${folderPath}`}>
                          <span className="text-base font-bold break-all">
                            {folderPath}
                          </span>
                        </Radio>
                      </div>
                    ))}
                    {displayedManualFolders.map((manual) => (
                      <div
                        key={`manual-${manual.folderId}`}
                        className="group flex items-center justify-between"
                      >
                        <Radio value={`manual:${manual.folderId}`}>
                          <span className="text-base font-bold break-all">
                            <span className="text-blue-500">
                              【{manual.count}】
                            </span>
                            {manual.folderPath}
                          </span>
                        </Radio>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveManualFolder(manual)
                          }}
                          className="text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                        />
                      </div>
                    ))}
                  </Radio.Group>
                ) : (
                  <div className="text-slate-500 dark:text-slate-400">
                    不属于任何已知分类
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <Button
                    type="link"
                    size="small"
                    icon={<FolderAddOutlined />}
                    onClick={() => setFolderSelectOpen(true)}
                  >
                    手动选择文件夹
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 底部操作：移到回收站 / 清除分类 / 不处理 / 重新执行 / 确认 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <div className="flex flex-wrap gap-2">
          <Button
            danger
            loading={actionLoading}
            disabled={!selectedId}
            onClick={handleDelete}
          >
            移到回收站
          </Button>
          <Button
            loading={actionLoading}
            disabled={!selectedId}
            onClick={() => runAction(clearOrganizeResultClassification)}
          >
            清除分类手动处理(A)
          </Button>
          <Button
            loading={actionLoading}
            disabled={!selectedId}
            onClick={() => runAction(skipOrganizeResult)}
          >
            不处理(S)
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={actionLoading}
            disabled={!selectedId}
            onClick={() => runAction(retryOrganizeResult)}
          >
            重新执行
          </Button>
          <Button
            type="primary"
            loading={actionLoading}
            disabled={!selectedId || !canConfirm}
            onClick={() => void runConfirm()}
          >
            确认(D)
          </Button>
        </div>
      </div>

      <FolderSelectModal
        open={folderSelectOpen}
        onClose={() => setFolderSelectOpen(false)}
        onConfirm={handleManualFolderSelect}
      />
    </div>
  )
}
