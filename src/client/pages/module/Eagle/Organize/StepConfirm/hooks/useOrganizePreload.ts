import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { useCallback, useEffect, useRef, useState } from 'react'
import { eagleFileUrl } from '../../../api'
import { fetchOrganizeResult } from '../../api'

const PRELOAD_COUNT = 5

export function useOrganizePreload({
  results,
  selectedId,
  quickMode,
}: {
  results: OrganizeResultListItem[]
  selectedId: string | null
  quickMode: boolean
}) {
  const [detailsMap, setDetailsMap] = useState<
    Record<string, OrganizeResultDetail>
  >({})
  const preloadedIdsRef = useRef(new Set<string>())
  const preloadImagesRef = useRef<HTMLImageElement[]>([])
  const fetchingDetailIdsRef = useRef(new Set<string>())
  const failedDetailIdsRef = useRef(new Set<string>())

  const fetchDetail = useCallback(async (itemId: string) => {
    if (
      fetchingDetailIdsRef.current.has(itemId) ||
      failedDetailIdsRef.current.has(itemId)
    ) {
      return
    }
    fetchingDetailIdsRef.current.add(itemId)
    try {
      const data = await fetchOrganizeResult(itemId)
      if (data) {
        setDetailsMap((prev) => ({ ...prev, [itemId]: data }))
      } else {
        failedDetailIdsRef.current.add(itemId)
      }
    } catch (error) {
      console.error(`拉取条目 ${itemId} 详情失败`, error)
      failedDetailIdsRef.current.add(itemId)
    } finally {
      fetchingDetailIdsRef.current.delete(itemId)
    }
  }, [])

  // 预加载当前项及接下来几张图片（仅在普通模式预加载详情与原图大图；快速模式由 IntersectionObserver 视口按需懒加载）
  useEffect(() => {
    if (quickMode || !selectedId || results.length === 0) return

    const currentIndex = results.findIndex((item) => item.itemId === selectedId)
    if (currentIndex === -1) return

    // 普通模式：预加载详情与原图大图（当前项及后续共 PRELOAD_COUNT 项）
    const targets = results.slice(currentIndex, currentIndex + PRELOAD_COUNT)
    targets.forEach((item) => {
      if (!detailsMap[item.itemId]) {
        void fetchDetail(item.itemId)
      }
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
  }, [quickMode, selectedId, results, detailsMap, fetchDetail])

  const detail = selectedId ? (detailsMap[selectedId] ?? null) : null
  const detailLoading = Boolean(
    selectedId && !detail && !failedDetailIdsRef.current.has(selectedId),
  )

  return {
    detail,
    detailLoading,
    detailsMap,
    fetchDetail,
  }
}
