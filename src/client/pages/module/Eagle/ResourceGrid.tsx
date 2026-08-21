import { usePlatform } from '@/client/hooks/usePlatform'
import type { EagleItem } from '@/shared/eagle/types'
import { PlayCircleOutlined } from '@ant-design/icons'
import { Image, Modal, Pagination, Spin } from 'antd'
import { useRef, useState } from 'react'
import { eagleFileUrl, eagleThumbnailUrl } from './api'
import type { EagleImageSize } from './store'
import { PAGE_SIZE, useEagleStore } from './store'

// 图片大小档位对应的网格列数（小档为原始密度，逐档递减一列）
const GRID_COLS: Record<EagleImageSize, string> = {
  small: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  large: 'grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

// 右侧资源网格：固定大小格子 + object-cover 缩略图，底部分页翻页
export function ResourceGrid() {
  const { items, total, listLoading, page, setPage, imageSize } =
    useEagleStore()
  const { isMobile } = usePlatform()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [videoItem, setVideoItem] = useState<EagleItem | null>(null)

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

  const handlePageChange = (next: number) => {
    setPage(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  if (listLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          暂无资源
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          <div className={`grid gap-2 ${GRID_COLS[imageSize]}`}>
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
        </div>
      )}

      {/* 底部分页栏 */}
      {total > 0 && (
        <div className="flex justify-center border-t border-slate-200 py-2 dark:border-slate-700">
          <Pagination
            current={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={handlePageChange}
            showSizeChanger={false}
            simple={isMobile}
          />
        </div>
      )}

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
