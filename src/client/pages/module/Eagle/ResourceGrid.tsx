import { PlayCircleOutlined } from '@ant-design/icons'
import { Image, Modal, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { EagleItem } from '@/shared/eagle/types'
import { eagleFileUrl, eagleThumbnailUrl } from './api'
import { useEagleStore } from './store'

// 右侧资源网格：固定大小格子 + object-cover 缩略图，滚动到底部分批加载
export function ResourceGrid() {
  const { items, total, listLoading, loadingMore, loadMore } = useEagleStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [videoItem, setVideoItem] = useState<EagleItem | null>(null)

  // 底部哨兵进入视口时加载下一批
  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { root, rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  // 预览组只收图片（视频走 Modal 播放）
  const imageItems = items.filter((item) => !item.isVideo)

  const handleClick = (item: EagleItem) => {
    if (item.isVideo) {
      setVideoItem(item)
      return
    }
    const index = imageItems.indexOf(item)
    setPreviewIndex(Math.max(0, index))
    setPreviewOpen(true)
  }

  if (listLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400">
        暂无资源
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {items.map((item) => (
          <div
            key={item.id}
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 border-transparent bg-slate-100 transition-all hover:border-blue-500 dark:bg-slate-800"
            onClick={() => handleClick(item)}
            title={item.name}
          >
            <img
              src={eagleThumbnailUrl(item.id)}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {item.isVideo && (
              <div className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-white">
                <PlayCircleOutlined />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 无限滚动哨兵 */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        {loadingMore && <Spin />}
        {!loadingMore && items.length >= total && items.length > 0 && (
          <span className="text-xs text-slate-400">已加载全部</span>
        )}
      </div>

      <Image.PreviewGroup
        items={imageItems.map((item) => eagleFileUrl(item.id))}
        preview={{
          open: previewOpen,
          current: previewIndex,
          onOpenChange: (open) => setPreviewOpen(open),
          onChange: (current) => setPreviewIndex(current),
        }}
      />

      <Modal
        open={videoItem !== null}
        footer={null}
        onCancel={() => setVideoItem(null)}
        width="80vw"
        centered
        destroyOnHidden
        title={videoItem?.name}
      >
        {videoItem && (
          <video
            src={eagleFileUrl(videoItem.id)}
            controls
            autoPlay
            className="max-h-[70vh] w-full"
          />
        )}
      </Modal>
    </div>
  )
}
