import type { EagleFolderTreeSettings } from '@/server/module/eagle/settings'
import type { EagleFolder } from '@/shared/eagle/types'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { collectFolderKeys } from '../folders'
import { EaglePreferenceDocument } from '../preferenceDocument'

const EXPANDED_STORAGE_KEY = 'eagle_folder_expanded'
const expansionDocument = new EaglePreferenceDocument<EagleFolderTreeSettings>(
  'eagle-folder-tree',
  { expandedFolderIds: null },
)

const loadLegacyExpandedKeys = (): string[] | null => {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed))
        return parsed.filter((key) => typeof key === 'string')
    }
  } catch {
    // 忽略损坏的本地缓存。
  }
  return null
}

/** 目录展开偏好与旧数据迁移；选中项定位仍由目录树组件处理。 */
export function useFolderExpansion(folders: EagleFolder[]) {
  const { value, loaded } = useSyncExternalStore(
    expansionDocument.subscribe,
    expansionDocument.getSnapshot,
  )
  const allKeys = useMemo(() => collectFolderKeys(folders), [folders])
  const [revealedKeys, setRevealedKeys] = useState<string[]>([])
  const expandedKeys = useMemo(
    () =>
      value.expandedFolderIds === null
        ? allKeys
        : [...new Set([...value.expandedFolderIds, ...revealedKeys])],
    [allKeys, revealedKeys, value.expandedFolderIds],
  )

  useEffect(() => {
    let cancelled = false
    void expansionDocument
      .load()
      .then(async () => {
        if (
          cancelled ||
          expansionDocument.getSnapshot().value.expandedFolderIds !== null
        )
          return
        const legacy = loadLegacyExpandedKeys()
        if (!legacy) return
        await expansionDocument.update((current) => ({
          expandedFolderIds: current.expandedFolderIds ?? legacy,
        }))
        // 写入成功后才移除旧记录，失败时保留迁移来源。
        localStorage.removeItem(EXPANDED_STORAGE_KEY)
      })
      .catch((error) =>
        console.error('加载或迁移 Eagle 目录展开状态失败', error),
      )
    return () => {
      cancelled = true
    }
  }, [])

  const handleExpand = useCallback((keys: React.Key[]) => {
    setRevealedKeys([])
    void expansionDocument
      .update(() => ({ expandedFolderIds: keys.map(String) }))
      .catch((error) => console.error('保存 Eagle 目录展开状态失败', error))
  }, [])

  return {
    expandedKeys,
    expandedStateLoaded: loaded,
    handleExpand,
    revealAncestors: setRevealedKeys,
  }
}
